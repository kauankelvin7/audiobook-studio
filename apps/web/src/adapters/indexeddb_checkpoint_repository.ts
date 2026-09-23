import type {
  CheckpointRecovery,
  CheckpointRepository,
  HistoricalAudioCompaction,
  PendingFileDeletion,
  ProjectCommitInput,
  ProjectStateRepository,
  RejectedCheckpoint,
} from "./ports";
import {
  artifactManifestRecordSchema,
  checkpointInputSchema,
  checkpointRecordSchema,
  storageIdSchema,
  type ArtifactManifestRecord,
  type CheckpointInput,
  type CheckpointRecord,
} from "../schemas/persistence";

const DATABASE_VERSION = 3;
const CHECKPOINT_STORE = "checkpoints";
const ARTIFACT_STORE = "artifacts";
const PENDING_DELETION_STORE = "pending_file_deletions";
const PROJECT_SEQUENCE_INDEX = "by_project_sequence";
const PROJECT_ARTIFACT_INDEX = "by_project";
const MAX_RECOVERY_CANDIDATES = 1_000;

export type PersistenceErrorCode =
  | "UNAVAILABLE"
  | "OPEN_FAILED"
  | "TRANSACTION_FAILED"
  | "QUOTA_EXCEEDED"
  | "CORRUPT_RECORD"
  | "UNSUPPORTED_SCHEMA"
  | "CHECKSUM_MISMATCH"
  | "RECOVERY_LIMIT"
  | "CHECKPOINT_CONFLICT"
  | "ARTIFACT_CONFLICT"
  | "MISSING_ARTIFACT_MANIFEST"
  | "CORRUPT_ARTIFACT_RECORD"
  | "PROJECT_MISMATCH"
  | "CHECKSUM_FAILED"
  | "COMPACTION_CONFLICT";

export class PersistenceError extends Error {
  constructor(public readonly code: PersistenceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PersistenceError";
  }
}

export type IndexedDbCheckpointRepositoryOptions = {
  indexedDb?: IDBFactory;
  keyRange?: typeof IDBKeyRange;
  subtle?: SubtleCrypto;
  databaseName?: string;
  maxRecoveryCandidates?: number;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function checkpointHashPayload(checkpoint: CheckpointInput): string {
  return JSON.stringify({
    schemaVersion: checkpoint.schemaVersion,
    projectId: checkpoint.projectId,
    sequence: checkpoint.sequence,
    createdAtMs: checkpoint.createdAtMs,
    pipelineVersion: checkpoint.pipelineVersion,
    sourceHash: checkpoint.sourceHash,
    job: { state: checkpoint.job.state, resumeState: checkpoint.job.resumeState },
    artifactKeys: checkpoint.artifactKeys,
  });
}

function sameArtifactRecord(left: ArtifactManifestRecord, right: ArtifactManifestRecord): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.projectId === right.projectId
    && left.artifactKey === right.artifactKey
    && left.kind === right.kind
    && left.contentHash === right.contentHash
    && left.fileName === right.fileName
    && left.mediaType === right.mediaType
    && left.sizeBytes === right.sizeBytes
    && left.regenerable === right.regenerable
    && left.pinned === right.pinned
    && left.finalArtifact === right.finalArtifact
    && left.expiresAtMs === right.expiresAtMs;
}

function toPersistenceError(error: unknown, fallback: PersistenceErrorCode): PersistenceError {
  if (error instanceof PersistenceError) return error;
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "QuotaExceededError") {
    return new PersistenceError("QUOTA_EXCEEDED", "A quota local não comporta este checkpoint.", { cause: error });
  }
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "ConstraintError") {
    return new PersistenceError("CHECKPOINT_CONFLICT", "Já existe outro checkpoint nesta sequência.", { cause: error });
  }
  return new PersistenceError(fallback, "A operação de persistência local falhou.", { cause: error });
}

export class IndexedDbCheckpointRepository implements CheckpointRepository, ProjectStateRepository {
  private readonly indexedDb: IDBFactory;
  private readonly keyRange: typeof IDBKeyRange;
  private readonly subtle: SubtleCrypto;
  private readonly databaseName: string;
  private readonly maxRecoveryCandidates: number;
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbCheckpointRepositoryOptions = {}) {
    const indexedDb = options.indexedDb ?? globalThis.indexedDB;
    const keyRange = options.keyRange ?? globalThis.IDBKeyRange;
    const subtle = options.subtle ?? globalThis.crypto?.subtle;
    if (!indexedDb || !keyRange || !subtle) {
      throw new PersistenceError("UNAVAILABLE", "IndexedDB ou Web Crypto não está disponível neste ambiente.");
    }
    this.indexedDb = indexedDb;
    this.keyRange = keyRange;
    this.subtle = subtle;
    this.databaseName = options.databaseName ?? "audiobook-studio";
    this.maxRecoveryCandidates = options.maxRecoveryCandidates ?? MAX_RECOVERY_CANDIDATES;
    if (!Number.isSafeInteger(this.maxRecoveryCandidates) || this.maxRecoveryCandidates < 1) {
      throw new RangeError("INVALID_RECOVERY_LIMIT");
    }
  }

  async save(input: CheckpointInput): Promise<CheckpointRecord> {
    const checkpoint = checkpointInputSchema.parse(input);
    const checksum = await this.checksum(checkpoint);
    const record = checkpointRecordSchema.parse({ ...checkpoint, checksum });

    try {
      const database = await this.database();
      const transaction = database.transaction(CHECKPOINT_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(CHECKPOINT_STORE);
      const existing = await requestResult(store.get([record.projectId, record.sequence]));
      if (existing !== undefined) {
        await done;
        const parsed = await this.validateStoredRecord(existing);
        if (parsed.checksum === record.checksum) return parsed;
        throw new PersistenceError("CHECKPOINT_CONFLICT", "A sequência já pertence a outro checkpoint.");
      }
      await requestResult(store.add(record));
      await done;
      return record;
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async commit(input: ProjectCommitInput): Promise<CheckpointRecord> {
    const checkpoint = checkpointInputSchema.parse(input.checkpoint);
    const artifacts = input.artifacts.map(artifact => artifactManifestRecordSchema.parse(artifact));
    const artifactsByKey = new Map<string, ArtifactManifestRecord>();

    for (const artifact of artifacts) {
      if (artifact.projectId !== checkpoint.projectId) {
        throw new PersistenceError("PROJECT_MISMATCH", "O artefato pertence a outro projeto.");
      }
      if (!checkpoint.artifactKeys.includes(artifact.artifactKey)) {
        throw new PersistenceError("ARTIFACT_CONFLICT", "O checkpoint não referencia um artefato fornecido.");
      }
      const duplicate = artifactsByKey.get(artifact.artifactKey);
      if (duplicate && !sameArtifactRecord(duplicate, artifact)) {
        throw new PersistenceError("ARTIFACT_CONFLICT", "Há manifests diferentes para a mesma chave de artefato.");
      }
      artifactsByKey.set(artifact.artifactKey, artifact);
    }

    const checksum = await this.checksum(checkpoint);
    const record = checkpointRecordSchema.parse({ ...checkpoint, checksum });

    try {
      const database = await this.database();
      const transaction = database.transaction([CHECKPOINT_STORE, ARTIFACT_STORE], "readwrite");
      const done = transactionDone(transaction);
      const checkpointStore = transaction.objectStore(CHECKPOINT_STORE);
      const artifactStore = transaction.objectStore(ARTIFACT_STORE);
      const existingCheckpointRaw = await requestResult(checkpointStore.get([record.projectId, record.sequence]));
      let existingCheckpoint: CheckpointRecord | null = null;

      if (existingCheckpointRaw !== undefined) {
        existingCheckpoint = this.parseStoredRecord(existingCheckpointRaw);
        if (JSON.stringify(existingCheckpoint) !== JSON.stringify(record)) {
          transaction.abort();
          await done.catch(() => undefined);
          throw new PersistenceError("CHECKPOINT_CONFLICT", "A sequência já pertence a outro checkpoint.");
        }
      }

      const missingArtifacts: ArtifactManifestRecord[] = [];
      for (const artifact of artifacts) {
        const existingRaw = await requestResult(artifactStore.get([artifact.projectId, artifact.artifactKey]));
        if (existingRaw === undefined) {
          missingArtifacts.push(artifact);
          continue;
        }
        const existing = this.validateArtifactRecord(existingRaw);
        if (!sameArtifactRecord(existing, artifact)) {
          transaction.abort();
          await done.catch(() => undefined);
          throw new PersistenceError("ARTIFACT_CONFLICT", "A chave de artefato já aponta para outro conteúdo.");
        }
      }

      for (const artifactKey of checkpoint.artifactKeys) {
        if (artifactsByKey.has(artifactKey)) continue;
        const existingRaw = await requestResult(artifactStore.get([checkpoint.projectId, artifactKey]));
        if (existingRaw === undefined) {
          transaction.abort();
          await done.catch(() => undefined);
          throw new PersistenceError("MISSING_ARTIFACT_MANIFEST", "O checkpoint referencia um artefato sem manifest persistido.");
        }
        this.validateArtifactRecord(existingRaw);
      }

      for (const artifact of missingArtifacts) await requestResult(artifactStore.add(artifact));
      if (!existingCheckpoint) await requestResult(checkpointStore.add(record));
      await done;
      return existingCheckpoint ?? record;
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async listProjectIds(): Promise<string[]> {
    try {
      const database = await this.database();
      const transaction = database.transaction(CHECKPOINT_STORE, "readonly");
      const done = transactionDone(transaction);
      const keys = await requestResult(transaction.objectStore(CHECKPOINT_STORE).getAllKeys());
      await done;
      const projectIds = new Set<string>();
      for (const key of keys) {
        if (!Array.isArray(key) || typeof key[0] !== "string") {
          throw new PersistenceError("CORRUPT_RECORD", "A chave de projeto armazenada está corrompida.");
        }
        projectIds.add(storageIdSchema.parse(key[0]));
      }
      return [...projectIds].sort();
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async listArtifacts(projectIdInput: string): Promise<ArtifactManifestRecord[]> {
    const projectId = storageIdSchema.parse(projectIdInput);
    try {
      const database = await this.database();
      const transaction = database.transaction(ARTIFACT_STORE, "readonly");
      const done = transactionDone(transaction);
      const values = await requestResult(transaction.objectStore(ARTIFACT_STORE).index(PROJECT_ARTIFACT_INDEX).getAll(projectId));
      await done;
      return values.map(value => this.validateArtifactRecord(value));
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async listAllArtifacts(): Promise<ArtifactManifestRecord[]> {
    try {
      const database = await this.database();
      const transaction = database.transaction(ARTIFACT_STORE, "readonly");
      const done = transactionDone(transaction);
      const values = await requestResult(transaction.objectStore(ARTIFACT_STORE).getAll());
      await done;
      return values.map(value => this.validateArtifactRecord(value));
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async listPendingFileDeletions(projectIdInput: string): Promise<PendingFileDeletion[]> {
    const projectId = storageIdSchema.parse(projectIdInput);
    try {
      const database = await this.database();
      const transaction = database.transaction(PENDING_DELETION_STORE, "readonly");
      const done = transactionDone(transaction);
      const range = this.keyRange.bound([projectId, ""], [projectId, "\uffff"]);
      const values = await requestResult(transaction.objectStore(PENDING_DELETION_STORE).getAll(range));
      await done;
      return values.map(value => {
        if (typeof value !== "object" || value === null || value.projectId !== projectId
          || typeof value.fileName !== "string" || !/^v1_[0-9a-f]{64}\.bin$/.test(value.fileName)
          || !Number.isSafeInteger(value.createdAtMs) || value.createdAtMs < 0) {
          throw new PersistenceError("CORRUPT_RECORD", "A fila de limpeza local está corrompida.");
        }
        return value as PendingFileDeletion;
      });
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async deletePendingFileDeletion(projectIdInput: string, fileName: string): Promise<void> {
    const projectId = storageIdSchema.parse(projectIdInput);
    if (!/^v1_[0-9a-f]{64}\.bin$/.test(fileName)) throw new PersistenceError("CORRUPT_RECORD", "Nome de arquivo de limpeza inválido.");
    try {
      const database = await this.database();
      const transaction = database.transaction(PENDING_DELETION_STORE, "readwrite");
      const done = transactionDone(transaction);
      await requestResult(transaction.objectStore(PENDING_DELETION_STORE).delete([projectId, fileName]));
      await done;
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async compactHistoricalAudio(input: HistoricalAudioCompaction): Promise<void> {
    const projectId = storageIdSchema.parse(input.projectId);
    const [audio, metadata] = input.artifacts.map(record => artifactManifestRecordSchema.parse(record));
    if (audio.projectId !== projectId || metadata.projectId !== projectId
      || audio.kind !== "audio_chunk" || metadata.kind !== "audio_metadata"
      || !/^literal_wav_[0-9a-f]{32}$/.test(audio.artifactKey)
      || metadata.artifactKey !== `${audio.artifactKey}_meta`
      || input.removedSequences.length === 0 || new Set(input.removedSequences).size !== input.removedSequences.length) {
      throw new PersistenceError("COMPACTION_CONFLICT", "A seleção de gravação para limpeza não é válida.");
    }
    let transaction: IDBTransaction | null = null;
    let completion: Promise<void> | null = null;
    try {
      const database = await this.database();
      transaction = database.transaction([CHECKPOINT_STORE, ARTIFACT_STORE, PENDING_DELETION_STORE], "readwrite");
      completion = transactionDone(transaction);
      const range = this.keyRange.bound([projectId, 0], [projectId, Number.MAX_SAFE_INTEGER]);
      const checkpointStore = transaction.objectStore(CHECKPOINT_STORE);
      const artifactStore = transaction.objectStore(ARTIFACT_STORE);
      const pendingStore = transaction.objectStore(PENDING_DELETION_STORE);
      const currentRaw = await requestResult(checkpointStore.index(PROJECT_SEQUENCE_INDEX).getAll(range, this.maxRecoveryCandidates + 1));
      const current = currentRaw.map(value => this.parseStoredRecord(value));
      const expected = input.expectedCheckpoints;
      if (current.length !== expected.length || current.some((item, index) =>
        JSON.stringify(item) !== JSON.stringify(expected[index]))
        || current.at(-1)?.checksum !== input.expectedLatestChecksum) {
        throw new PersistenceError("COMPACTION_CONFLICT", "O histórico do projeto mudou durante a limpeza.");
      }
      const removed = new Set(input.removedSequences);
      const retained = current.filter(item => !removed.has(item.sequence));
      if (retained.length < 2 || removed.has(current.at(-1)!.sequence)
        || current.filter(item => removed.has(item.sequence)).length !== removed.size
        || current.some(item => removed.has(item.sequence)
          && (!item.artifactKeys.includes(audio.artifactKey) || !item.artifactKeys.includes(metadata.artifactKey)))
        || retained.some(item => item.artifactKeys.includes(audio.artifactKey)
          || item.artifactKeys.includes(metadata.artifactKey))) {
        throw new PersistenceError("COMPACTION_CONFLICT", "A limpeza afetaria o checkpoint atual ou a recuperação.");
      }
      for (const record of [audio, metadata]) {
        const raw = await requestResult(artifactStore.get([projectId, record.artifactKey]));
        if (raw === undefined || !sameArtifactRecord(this.validateArtifactRecord(raw), record)) {
          throw new PersistenceError("COMPACTION_CONFLICT", "O artefato mudou durante a limpeza.");
        }
      }
      for (const sequence of removed) await requestResult(checkpointStore.delete([projectId, sequence]));
      for (const record of [audio, metadata]) {
        await requestResult(artifactStore.delete([projectId, record.artifactKey]));
        await requestResult(pendingStore.put({ projectId, fileName: record.fileName, createdAtMs: Date.now() }));
      }
      await completion;
    } catch (error) {
      try { transaction?.abort(); } catch { /* Já concluída ou abortada. */ }
      await completion?.catch(() => undefined);
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async deleteArtifactRecord(projectIdInput: string, artifactKeyInput: string): Promise<void> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const artifactKey = storageIdSchema.parse(artifactKeyInput);
    try {
      const database = await this.database();
      const transaction = database.transaction(ARTIFACT_STORE, "readwrite");
      const done = transactionDone(transaction);
      await requestResult(transaction.objectStore(ARTIFACT_STORE).delete([projectId, artifactKey]));
      await done;
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async loadLatest(projectIdInput: string): Promise<CheckpointRecord | null> {
    const projectId = storageIdSchema.parse(projectIdInput);
    try {
      const database = await this.database();
      const transaction = database.transaction(CHECKPOINT_STORE, "readonly");
      const done = transactionDone(transaction);
      const range = this.keyRange.bound([projectId, 0], [projectId, Number.MAX_SAFE_INTEGER]);
      const cursor = await requestResult(transaction.objectStore(CHECKPOINT_STORE).index(PROJECT_SEQUENCE_INDEX).openCursor(range, "prev"));
      await done;
      if (!cursor) return null;
      return await this.validateStoredRecord(cursor.value);
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async listCheckpoints(projectIdInput: string): Promise<CheckpointRecord[]> {
    const projectId = storageIdSchema.parse(projectIdInput);
    try {
      const database = await this.database();
      const transaction = database.transaction(CHECKPOINT_STORE, "readonly");
      const done = transactionDone(transaction);
      const range = this.keyRange.bound([projectId, 0], [projectId, Number.MAX_SAFE_INTEGER]);
      const values = await requestResult(transaction.objectStore(CHECKPOINT_STORE).index(PROJECT_SEQUENCE_INDEX).getAll(range, this.maxRecoveryCandidates + 1));
      await done;
      if (values.length > this.maxRecoveryCandidates) throw new PersistenceError("RECOVERY_LIMIT", "O histórico excede o limite seguro para limpeza.");
      return await Promise.all(values.map(value => this.validateStoredRecord(value)));
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  async recoverLatest(projectIdInput: string): Promise<CheckpointRecovery> {
    const projectId = storageIdSchema.parse(projectIdInput);
    let collected: { candidates: Array<{ sequence: number; value: unknown }>; truncated: boolean };
    try {
      const database = await this.database();
      const transaction = database.transaction(CHECKPOINT_STORE, "readonly");
      const done = transactionDone(transaction);
      const range = this.keyRange.bound([projectId, 0], [projectId, Number.MAX_SAFE_INTEGER]);
      collected = await this.collectCandidates(transaction.objectStore(CHECKPOINT_STORE).index(PROJECT_SEQUENCE_INDEX).openCursor(range, "prev"));
      await done;
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }

    const rejected: RejectedCheckpoint[] = [];
    for (const candidate of collected.candidates) {
      try {
        return { checkpoint: await this.validateStoredRecord(candidate.value), rejected };
      } catch (error) {
        if (error instanceof PersistenceError && ["CORRUPT_RECORD", "UNSUPPORTED_SCHEMA", "CHECKSUM_MISMATCH"].includes(error.code)) {
          rejected.push({ sequence: candidate.sequence, code: error.code as RejectedCheckpoint["code"] });
          continue;
        }
        throw error;
      }
    }
    if (collected.truncated) throw new PersistenceError("RECOVERY_LIMIT", "Nenhum checkpoint válido foi encontrado no limite de recuperação.");
    return { checkpoint: null, rejected };
  }

  async delete(projectIdInput: string, sequence: number): Promise<void> {
    const projectId = storageIdSchema.parse(projectIdInput);
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new RangeError("INVALID_CHECKPOINT_SEQUENCE");
    try {
      const database = await this.database();
      const transaction = database.transaction(CHECKPOINT_STORE, "readwrite");
      const done = transactionDone(transaction);
      await requestResult(transaction.objectStore(CHECKPOINT_STORE).delete([projectId, sequence]));
      await done;
    } catch (error) {
      throw toPersistenceError(error, "TRANSACTION_FAILED");
    }
  }

  close(): void {
    if (!this.databasePromise) return;
    const databasePromise = this.databasePromise;
    this.databasePromise = null;
    void databasePromise.then(database => database.close(), () => undefined);
  }

  private database(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.indexedDb.open(this.databaseName, DATABASE_VERSION);
      let blocked = false;
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(CHECKPOINT_STORE)) {
          const store = database.createObjectStore(CHECKPOINT_STORE, { keyPath: ["projectId", "sequence"] });
          store.createIndex(PROJECT_SEQUENCE_INDEX, ["projectId", "sequence"], { unique: true });
        }
        if (!database.objectStoreNames.contains(ARTIFACT_STORE)) {
          const store = database.createObjectStore(ARTIFACT_STORE, { keyPath: ["projectId", "artifactKey"] });
          store.createIndex(PROJECT_ARTIFACT_INDEX, "projectId", { unique: false });
        }
        if (!database.objectStoreNames.contains(PENDING_DELETION_STORE)) {
          database.createObjectStore(PENDING_DELETION_STORE, { keyPath: ["projectId", "fileName"] });
        }
      };
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => {
          request.result.close();
          this.databasePromise = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(toPersistenceError(request.error, "OPEN_FAILED"));
      request.onblocked = () => {
        blocked = true;
        reject(new PersistenceError("OPEN_FAILED", "Outra aba bloqueou a atualização do banco local."));
      };
    });
    this.databasePromise = opening.catch(error => {
      this.databasePromise = null;
      throw toPersistenceError(error, "OPEN_FAILED");
    });
    return this.databasePromise;
  }

  private async checksum(checkpoint: CheckpointInput): Promise<string> {
    try {
      const bytes = new TextEncoder().encode(checkpointHashPayload(checkpoint));
      const digest = await this.subtle.digest("SHA-256", bytes);
      const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      return `sha256:${hex}`;
    } catch (error) {
      throw new PersistenceError("CHECKSUM_FAILED", "Não foi possível calcular o checksum do checkpoint.", { cause: error });
    }
  }

  private collectCandidates(request: IDBRequest<IDBCursorWithValue | null>): Promise<{ candidates: Array<{ sequence: number; value: unknown }>; truncated: boolean }> {
    return new Promise((resolve, reject) => {
      const candidates: Array<{ sequence: number; value: unknown }> = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve({ candidates, truncated: false });
          return;
        }
        const key = cursor.primaryKey;
        if (!Array.isArray(key) || typeof key[1] !== "number") {
          reject(new PersistenceError("CORRUPT_RECORD", "A chave do checkpoint está corrompida."));
          return;
        }
        candidates.push({ sequence: key[1], value: cursor.value });
        if (candidates.length > this.maxRecoveryCandidates) {
          resolve({ candidates: candidates.slice(0, this.maxRecoveryCandidates), truncated: true });
          return;
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB cursor failed"));
    });
  }

  private parseStoredRecord(input: unknown): CheckpointRecord {
    if (typeof input === "object" && input !== null && "schemaVersion" in input && input.schemaVersion !== 1) {
      throw new PersistenceError("UNSUPPORTED_SCHEMA", "A versão deste checkpoint ainda não é suportada.");
    }
    const parsed = checkpointRecordSchema.safeParse(input);
    if (!parsed.success) throw new PersistenceError("CORRUPT_RECORD", "O checkpoint armazenado está corrompido.");
    return parsed.data;
  }

  private async validateStoredRecord(input: unknown): Promise<CheckpointRecord> {
    const parsed = this.parseStoredRecord(input);
    const { checksum, ...checkpoint } = parsed;
    if (await this.checksum(checkpoint) !== checksum) {
      throw new PersistenceError("CHECKSUM_MISMATCH", "O checksum do checkpoint não confere.");
    }
    return parsed;
  }

  private validateArtifactRecord(input: unknown): ArtifactManifestRecord {
    if (typeof input === "object" && input !== null && "schemaVersion" in input && input.schemaVersion !== 1) {
      throw new PersistenceError("UNSUPPORTED_SCHEMA", "A versão deste manifest de artefato ainda não é suportada.");
    }
    const parsed = artifactManifestRecordSchema.safeParse(input);
    if (!parsed.success) {
      throw new PersistenceError("CORRUPT_ARTIFACT_RECORD", "O manifest de artefato armazenado está corrompido.");
    }
    return parsed.data;
  }
}

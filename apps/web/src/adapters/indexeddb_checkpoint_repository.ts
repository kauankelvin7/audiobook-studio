import type { CheckpointRecovery, CheckpointRepository, RejectedCheckpoint } from "./ports";
import {
  checkpointInputSchema,
  checkpointRecordSchema,
  storageIdSchema,
  type CheckpointInput,
  type CheckpointRecord,
} from "../schemas/persistence";

const DATABASE_VERSION = 1;
const CHECKPOINT_STORE = "checkpoints";
const PROJECT_SEQUENCE_INDEX = "by_project_sequence";
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
  | "CHECKSUM_FAILED";

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

export class IndexedDbCheckpointRepository implements CheckpointRepository {
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

  private async validateStoredRecord(input: unknown): Promise<CheckpointRecord> {
    if (typeof input === "object" && input !== null && "schemaVersion" in input && input.schemaVersion !== 1) {
      throw new PersistenceError("UNSUPPORTED_SCHEMA", "A versão deste checkpoint ainda não é suportada.");
    }
    const parsed = checkpointRecordSchema.safeParse(input);
    if (!parsed.success) throw new PersistenceError("CORRUPT_RECORD", "O checkpoint armazenado está corrompido.");
    const { checksum, ...checkpoint } = parsed.data;
    if (await this.checksum(checkpoint) !== checksum) {
      throw new PersistenceError("CHECKSUM_MISMATCH", "O checksum do checkpoint não confere.");
    }
    return parsed.data;
  }
}

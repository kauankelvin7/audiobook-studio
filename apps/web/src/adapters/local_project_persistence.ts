import { storageIdSchema, type ArtifactManifestRecord, type CheckpointInput, type CheckpointRecord } from "../schemas/persistence";
import { evictionCandidates } from "./storage_policy";
import type {
  ArtifactMaintenanceStore,
  ArtifactWrite,
  CheckpointRepository,
  ProjectLock,
  ProjectStateRepository,
  RejectedCheckpoint,
} from "./ports";

type StateRepository = CheckpointRepository & ProjectStateRepository;
export type CheckpointDraft = Omit<CheckpointInput, "sequence">;

export type PersistProjectResult = {
  checkpoint: CheckpointRecord;
  artifacts: ArtifactManifestRecord[];
};

export type ResumeInspection = {
  checkpoint: CheckpointRecord | null;
  rejectedCheckpoints: RejectedCheckpoint[];
  artifacts: ArtifactManifestRecord[];
  unavailableArtifactKeys: string[];
  resumable: boolean;
};
export type StorageReconciliation = {
  knownFileNames: string[];
  managedFileNames: string[];
  orphanFileNames: string[];
  missingFileNames: string[];
};

export type LocalProjectPersistenceErrorCode = "PROJECT_MISMATCH" | "CHECKPOINT_CHANGED";

export class LocalProjectPersistenceError extends Error {
  constructor(public readonly code: LocalProjectPersistenceErrorCode, message: string) {
    super(message);
    this.name = "LocalProjectPersistenceError";
  }
}

export class LocalProjectPersistence {
  constructor(
    private readonly state: StateRepository,
    private readonly artifacts: ArtifactMaintenanceStore,
    private readonly lock: ProjectLock,
  ) {}

  async persist(checkpointInput: CheckpointInput, writes: ArtifactWrite[]): Promise<PersistProjectResult> {
    const projectId = storageIdSchema.parse(checkpointInput.projectId);
    return await this.lock.runExclusive(projectId, async () =>
      await this.persistLocked(checkpointInput, writes, projectId));
  }

  async persistNext(checkpointDraft: CheckpointDraft, writes: ArtifactWrite[], expectedLatestChecksum?: string): Promise<PersistProjectResult> {
    const projectId = storageIdSchema.parse(checkpointDraft.projectId);
    return await this.lock.runExclusive(projectId, async () => {
      const latest = await this.state.loadLatest(projectId);
      if (expectedLatestChecksum !== undefined && latest?.checksum !== expectedLatestChecksum) {
        throw new LocalProjectPersistenceError("CHECKPOINT_CHANGED", "O projeto mudou durante a revisão.");
      }
      const sequence = (latest?.sequence ?? 0) + 1;
      return await this.persistLocked({ ...checkpointDraft, sequence }, writes, projectId);
    });
  }

  async loadLatest(projectIdInput: string): Promise<CheckpointRecord | null> {
    return await this.state.loadLatest(storageIdSchema.parse(projectIdInput));
  }

  async loadArtifactRecord(projectIdInput: string, artifactKeyInput: string): Promise<ArtifactManifestRecord | null> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const artifactKey = storageIdSchema.parse(artifactKeyInput);
    const records = await this.state.listArtifacts(projectId);
    return records.find(record => record.artifactKey === artifactKey) ?? null;
  }

  async listArtifactRecords(projectIdInput: string): Promise<ArtifactManifestRecord[]> {
    return await this.state.listArtifacts(storageIdSchema.parse(projectIdInput));
  }

  async listProjectIds(): Promise<string[]> {
    return await this.state.listProjectIds();
  }

  async readArtifact(record: ArtifactManifestRecord): Promise<Blob> {
    return await this.artifacts.get(record);
  }

  async inspectResume(projectIdInput: string): Promise<ResumeInspection> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const recovery = await this.state.recoverLatest(projectId);
    if (!recovery.checkpoint) {
      return {
        checkpoint: null,
        rejectedCheckpoints: recovery.rejected,
        artifacts: [],
        unavailableArtifactKeys: [],
        resumable: false,
      };
    }
    const manifests = await this.state.listArtifacts(projectId);
    const byKey = new Map(manifests.map(record => [record.artifactKey, record]));
    const artifacts: ArtifactManifestRecord[] = [];
    const unavailableArtifactKeys: string[] = [];

    for (const artifactKey of recovery.checkpoint.artifactKeys) {
      const record = byKey.get(artifactKey);
      if (!record) {
        unavailableArtifactKeys.push(artifactKey);
        continue;
      }
      try {
        await this.artifacts.get(record);
        artifacts.push(record);
      } catch {
        unavailableArtifactKeys.push(artifactKey);
      }
    }

    return {
      checkpoint: recovery.checkpoint,
      rejectedCheckpoints: recovery.rejected,
      artifacts,
      unavailableArtifactKeys,
      resumable: unavailableArtifactKeys.length === 0,
    };
  }

  async reconcileStorage(): Promise<StorageReconciliation> {
    const manifests = await this.state.listAllArtifacts();
    const knownFileNames = [...new Set(manifests.map(record => record.fileName))].sort();
    const managedFileNames = await this.artifacts.listFileNames();
    const known = new Set(knownFileNames);
    const managed = new Set(managedFileNames);

    return {
      knownFileNames,
      managedFileNames,
      orphanFileNames: managedFileNames.filter(fileName => !known.has(fileName)),
      missingFileNames: knownFileNames.filter(fileName => !managed.has(fileName)),
    };
  }

  async cleanupRegenerableArtifacts(bytesNeeded: number, currentProjectIdInput: string): Promise<ArtifactManifestRecord[]> {
    const currentProjectId = storageIdSchema.parse(currentProjectIdInput);
    const manifests = await this.state.listAllArtifacts();
    const byId = new Map(manifests.map(record => [`${record.projectId}:${record.artifactKey}`, record]));
    const candidates = evictionCandidates(
      manifests.map(record => ({
        id: `${record.projectId}:${record.artifactKey}`,
        sizeBytes: record.sizeBytes,
        lastAccessedAt: record.lastAccessedAtMs,
        regenerable: record.regenerable,
        pinned: record.pinned,
        currentProject: record.projectId === currentProjectId,
        finalArtifact: record.finalArtifact,
      })),
      bytesNeeded,
    );

    const removed: ArtifactManifestRecord[] = [];
    for (const candidate of candidates) {
      const record = byId.get(candidate.id);
      if (!record) continue;
      await this.artifacts.delete(record);
      await this.state.deleteArtifactRecord(record.projectId, record.artifactKey);
      removed.push(record);
    }
    return removed;
  }

  private async persistLocked(
    checkpointInput: CheckpointInput,
    writes: ArtifactWrite[],
    projectId: string,
  ): Promise<PersistProjectResult> {
    const written: ArtifactManifestRecord[] = [];
    for (const write of writes) {
      if (write.projectId !== projectId) {
        throw new LocalProjectPersistenceError("PROJECT_MISMATCH", "O artefato pertence a outro projeto.");
      }
      written.push(await this.artifacts.put(write));
    }

    const checkpoint = await this.state.commit({ checkpoint: checkpointInput, artifacts: written });
    const canonical = await this.state.listArtifacts(projectId);
    const writtenKeys = new Set(written.map(record => record.artifactKey));
    return {
      checkpoint,
      artifacts: canonical.filter(record => writtenKeys.has(record.artifactKey)),
    };
  }
}

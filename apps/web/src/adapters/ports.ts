import type { DocumentIr } from "../schemas/document";
import type { ArtifactKind, ArtifactManifestRecord, CheckpointInput, CheckpointRecord } from "../schemas/persistence";

export type RejectedCheckpoint = {
  sequence: number;
  code: "CORRUPT_RECORD" | "UNSUPPORTED_SCHEMA" | "CHECKSUM_MISMATCH";
};

export type CheckpointRecovery = {
  checkpoint: CheckpointRecord | null;
  rejected: RejectedCheckpoint[];
};

export interface DocumentSource { extract(file: File): Promise<DocumentIr>; }
export interface SpeechEngine { synthesize(text: string): Promise<Blob>; }
export type ArtifactWrite = {
  projectId: string;
  artifactKey: string;
  kind: ArtifactKind;
  value: Blob;
  mediaType: string;
  createdAtMs: number;
  regenerable: boolean;
  pinned: boolean;
  finalArtifact: boolean;
  expiresAtMs: number | null;
};
export interface ArtifactStore {
  put(input: ArtifactWrite): Promise<ArtifactManifestRecord>;
  get(record: ArtifactManifestRecord): Promise<Blob>;
  delete(record: ArtifactManifestRecord): Promise<void>;
}
export interface ArtifactMaintenanceStore extends ArtifactStore {
  listFileNames(): Promise<string[]>;
  deleteFileName(fileName: string): Promise<void>;
}
export interface ProjectLock {
  runExclusive<T>(projectId: string, operation: () => Promise<T>): Promise<T>;
}
export type ProjectCommitInput = {
  checkpoint: CheckpointInput;
  artifacts: ArtifactManifestRecord[];
};
export type PendingFileDeletion = { projectId: string; fileName: string; createdAtMs: number };
export type HistoricalAudioCompaction = {
  projectId: string;
  expectedLatestChecksum: string;
  expectedCheckpoints: CheckpointRecord[];
  removedSequences: number[];
  artifacts: [ArtifactManifestRecord, ArtifactManifestRecord];
};
export interface ProjectStateRepository {
  commit(input: ProjectCommitInput): Promise<CheckpointRecord>;
  listProjectIds(): Promise<string[]>;
  listArtifacts(projectId: string): Promise<ArtifactManifestRecord[]>;
  listAllArtifacts(): Promise<ArtifactManifestRecord[]>;
  deleteArtifactRecord(projectId: string, artifactKey: string): Promise<void>;
  compactHistoricalAudio(input: HistoricalAudioCompaction): Promise<void>;
  listPendingFileDeletions(projectId: string): Promise<PendingFileDeletion[]>;
  deletePendingFileDeletion(projectId: string, fileName: string): Promise<void>;
}
export interface CheckpointRepository {
  save(checkpoint: CheckpointInput): Promise<CheckpointRecord>;
  loadLatest(projectId: string): Promise<CheckpointRecord | null>;
  recoverLatest(projectId: string): Promise<CheckpointRecovery>;
  listCheckpoints(projectId: string): Promise<CheckpointRecord[]>;
  delete(projectId: string, sequence: number): Promise<void>;
  close(): void;
}

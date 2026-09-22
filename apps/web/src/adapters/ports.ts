import type { DocumentIr } from "../schemas/document";
import type { CheckpointInput, CheckpointRecord } from "../schemas/persistence";

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
export interface ArtifactStore { put(key: string, value: Blob): Promise<void>; }
export interface CheckpointRepository {
  save(checkpoint: CheckpointInput): Promise<CheckpointRecord>;
  loadLatest(projectId: string): Promise<CheckpointRecord | null>;
  recoverLatest(projectId: string): Promise<CheckpointRecovery>;
  delete(projectId: string, sequence: number): Promise<void>;
  close(): void;
}

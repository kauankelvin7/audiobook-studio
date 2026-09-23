import { z } from "zod";

export const storageIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const sourceHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const artifactKindSchema = z.enum([
  "source_pdf",
  "document_ir",
  "ocr_cache",
  "model",
  "audio_chunk",
  "audio_metadata",
  "final_audio",
  "review_submission",
  "active_narrative",
  "temporary",
]);

export const artifactFileNameSchema = z.string().regex(/^v1_[0-9a-f]{64}\.bin$/);

export const artifactManifestRecordSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: storageIdSchema,
  artifactKey: storageIdSchema,
  kind: artifactKindSchema,
  contentHash: sourceHashSchema,
  fileName: artifactFileNameSchema,
  mediaType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().safe(),
  createdAtMs: z.number().int().nonnegative().safe(),
  lastAccessedAtMs: z.number().int().nonnegative().safe(),
  regenerable: z.boolean(),
  pinned: z.boolean(),
  finalArtifact: z.boolean(),
  expiresAtMs: z.number().int().nonnegative().safe().nullable(),
}).strict().superRefine((artifact, context) => {
  if (artifact.lastAccessedAtMs < artifact.createdAtMs) {
    context.addIssue({ code: "custom", message: "Last access cannot precede creation" });
  }
  if (artifact.expiresAtMs !== null && artifact.kind !== "temporary") {
    context.addIssue({ code: "custom", message: "Only temporary artifacts may expire" });
  }
  if (artifact.finalArtifact !== (artifact.kind === "final_audio")) {
    context.addIssue({ code: "custom", message: "Final artifact flag must match its kind" });
  }
});

export const generationJobStateSchema = z.enum([
  "CREATED",
  "INGESTING",
  "EXTRACTING",
  "STRUCTURING",
  "SCRIPTING",
  "VERIFYING",
  "READY_FOR_AUDIO",
  "SYNTHESIZING",
  "PACKAGING",
  "FINAL_AUDIT",
  "COMPLETED",
  "COMPLETED_WITH_WARNINGS",
  "PAUSED",
  "WAITING_USER",
  "FAILED_RETRYABLE",
  "FAILED_FATAL",
  "CANCELLED",
]);

const activeJobStates = new Set([
  "CREATED",
  "INGESTING",
  "EXTRACTING",
  "STRUCTURING",
  "SCRIPTING",
  "VERIFYING",
  "READY_FOR_AUDIO",
  "SYNTHESIZING",
  "PACKAGING",
  "FINAL_AUDIT",
]);
const resumableJobStates = new Set(["PAUSED", "WAITING_USER", "FAILED_RETRYABLE"]);

export const generationJobSnapshotSchema = z.object({
  state: generationJobStateSchema,
  resumeState: generationJobStateSchema.nullable(),
}).strict().superRefine((snapshot, context) => {
  if (resumableJobStates.has(snapshot.state)) {
    if (snapshot.resumeState === null || !activeJobStates.has(snapshot.resumeState)) {
      context.addIssue({ code: "custom", message: "Resumable jobs require an active resume state" });
    }
  } else if (snapshot.resumeState !== null) {
    context.addIssue({ code: "custom", message: "Only resumable jobs may keep a resume state" });
  }
});

export const checkpointInputSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: storageIdSchema,
  sequence: z.number().int().nonnegative().safe(),
  createdAtMs: z.number().int().nonnegative().safe(),
  pipelineVersion: z.string().trim().min(1).max(128),
  sourceHash: sourceHashSchema.nullable(),
  job: generationJobSnapshotSchema,
  artifactKeys: z.array(storageIdSchema).max(10_000).superRefine((keys, context) => {
    if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "Artifact keys must be unique" });
  }),
}).strict();

export const checkpointRecordSchema = checkpointInputSchema.extend({
  checksum: sourceHashSchema,
}).strict();

export type GenerationJobSnapshot = z.infer<typeof generationJobSnapshotSchema>;
export type CheckpointInput = z.infer<typeof checkpointInputSchema>;
export type CheckpointRecord = z.infer<typeof checkpointRecordSchema>;
export type ArtifactKind = z.infer<typeof artifactKindSchema>;
export type ArtifactManifestRecord = z.infer<typeof artifactManifestRecordSchema>;

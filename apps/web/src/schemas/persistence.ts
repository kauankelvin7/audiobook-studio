import { z } from "zod";

export const storageIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const sourceHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

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

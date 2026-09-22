import { describe, expect, it } from "vitest";
import checkpointFixture from "../../../../tests/fixtures/checkpoint_input_v1.json";
import { checkpointInputSchema, generationJobSnapshotSchema } from "./persistence";

describe("persistence schemas", () => {
  it("parses the checkpoint fixture shared with Rust", () => {
    expect(checkpointInputSchema.parse(checkpointFixture)).toEqual(checkpointFixture);
  });

  it("accepts resumable snapshots only with an active resume state", () => {
    expect(generationJobSnapshotSchema.safeParse({ state: "PAUSED", resumeState: "EXTRACTING" }).success).toBe(true);
    expect(generationJobSnapshotSchema.safeParse({ state: "PAUSED", resumeState: null }).success).toBe(false);
    expect(generationJobSnapshotSchema.safeParse({ state: "COMPLETED", resumeState: "EXTRACTING" }).success).toBe(false);
  });

  it("rejects duplicate artifact keys and unsafe identifiers", () => {
    const input = {
      schemaVersion: 1,
      projectId: "project_1",
      sequence: 1,
      createdAtMs: 1,
      pipelineVersion: "m3.1",
      sourceHash: null,
      job: { state: "INGESTING", resumeState: null },
      artifactKeys: ["source", "source"],
    };
    expect(checkpointInputSchema.safeParse(input).success).toBe(false);
    expect(checkpointInputSchema.safeParse({ ...input, artifactKeys: [], projectId: "../escape" }).success).toBe(false);
  });
});

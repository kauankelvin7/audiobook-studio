import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import content from "../../../../tests/fixtures/content_model_v1.json";
import outline from "../../../../tests/fixtures/semantic_outline_v1.json";
import plan from "../../../../tests/fixtures/narrative_plan_content_v1.json";
import script from "../../../../tests/fixtures/narrative_script_content_v1.json";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { ActiveNarrativePersistence } from "./active_narrative_persistence";
import { ActiveReviewEvaluator } from "./active_review_evaluation";
import { IndexedDbCheckpointRepository } from "./indexeddb_checkpoint_repository";
import { LocalProjectPersistence } from "./local_project_persistence";
import { OpfsArtifactStore } from "./opfs_artifact_store";
import type { ProjectLock } from "./ports";
import { ReviewSubmissionPersistence } from "./review_submission_persistence";
import { buildScriptReviewPacket } from "./rust_script_pipeline";

initSync({ module: readFileSync(fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url))) });

const context = { expectedPlanId: "plan_1", script, plan, content, outline };
const lock: ProjectLock = { runExclusive: async (_projectId, operation) => await operation() };

function setup(name: string) {
  const state = new IndexedDbCheckpointRepository({ indexedDb: new IDBFactory(), keyRange: IDBKeyRange, databaseName: name });
  const files = new Map<string, Blob>();
  const artifacts = new OpfsArtifactStore({
    subtle: webcrypto.subtle as SubtleCrypto,
    getRoot: async () => ({
      getFileHandle: async (fileName: string, options?: { create?: boolean }) => {
        if (!files.has(fileName) && !options?.create) throw new DOMException("missing", "NotFoundError");
        if (!files.has(fileName)) files.set(fileName, new Blob());
        return {
          getFile: async () => files.get(fileName)!,
          createWritable: async () => ({
            write: async (value: Blob) => { files.set(fileName, value); },
            close: async () => undefined,
          }),
        };
      },
      removeEntry: async (fileName: string) => { files.delete(fileName); },
      keys: async function* () { yield* files.keys(); },
    }),
  });
  const persistence = new LocalProjectPersistence(state, artifacts, lock);
  return {
    state, files, persistence,
    review: new ReviewSubmissionPersistence(persistence),
    active: new ActiveNarrativePersistence(persistence),
    evaluator: new ActiveReviewEvaluator(persistence),
  };
}

async function submission() {
  const packet = await buildScriptReviewPacket("plan_1", script, plan, content, outline);
  return {
    schemaVersion: 1 as const,
    planId: packet.planId,
    documentId: packet.documentId,
    sourceHash: packet.sourceHash,
    contentHash: packet.contentHash,
    planHash: packet.planHash,
    scriptHash: packet.scriptHash,
    decisions: [{
      segmentId: packet.segments[0].segmentId,
      verdict: "supported" as const,
      evidenceSourceUnitIds: [packet.segments[0].sources[0].sourceUnitId],
      rationale: "Conferido com o trecho indicado.",
    }],
  };
}

describe("review submission persistence", () => {
  it("stores a pinned review linked to its Rust submission hash and revalidates on read", async () => {
    const { state, persistence, review } = setup("review-roundtrip");
    const input = await submission();
    await persistence.persist({
      schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: input.sourceHash,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: [],
    }, []);

    const saved = await review.save("project_1", context, input);
    await expect(review.save("project_1", context, {})).rejects.toMatchObject({ code: "INVALID_SUBMISSION" });
    expect(saved.receipt.attestationStatus).toBe("unverified");
    expect(saved.artifact).toMatchObject({ kind: "review_submission", pinned: true, regenerable: false });
    expect(saved.artifact.artifactKey).toBe(`review_${saved.receipt.submissionHash.slice(7)}`);
    expect(saved.currentness).toBe("not_established");
    await expect(review.readHistoricalAgainstContext("project_1", saved.artifact, context))
      .resolves.toMatchObject({ receipt: saved.receipt, currentness: "not_established" });
    await expect(review.readHistoricalAgainstContext("project_1", { ...saved.artifact, lastAccessedAtMs: saved.artifact.lastAccessedAtMs + 1 }, context))
      .rejects.toMatchObject({ code: "WRONG_ARTIFACT" });
    await expect(review.readHistoricalAgainstContext("project_1", { ...saved.artifact, createdAtMs: saved.artifact.createdAtMs + 1 }, context))
      .rejects.toMatchObject({ code: "WRONG_ARTIFACT" });
    const current = await persistence.loadLatest("project_1");
    const { sequence: _sequence, checksum: _checksum, ...draft } = current!;
    await persistence.persistNext({
      ...draft, createdAtMs: current!.createdAtMs + 1,
      sourceHash: `sha256:${"a".repeat(64)}`, artifactKeys: [],
    }, [], current!.checksum);
    await expect(review.readHistoricalAgainstContext("project_1", saved.artifact, context))
      .resolves.toMatchObject({ currentness: "not_established" });
    await expect(persistence.cleanupRegenerableArtifacts(1, "other_project")).resolves.toEqual([]);
    state.close();
  });

  it("rejects stale source, changed script and corrupt stored bytes", async () => {
    const { state, files, persistence, review } = setup("review-stale");
    const input = await submission();
    await persistence.persist({
      schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: `sha256:${"a".repeat(64)}`,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: [],
    }, []);
    await expect(review.save("project_1", context, input)).rejects.toMatchObject({ code: "SOURCE_CHANGED" });
    const latest = await persistence.loadLatest("project_1");
    await persistence.persistNext({
      schemaVersion: 1, projectId: "project_1", createdAtMs: 2,
      pipelineVersion: "m4", sourceHash: input.sourceHash,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: [],
    }, [], latest!.checksum);
    const saved = await review.save("project_1", context, input);
    await expect(review.readHistoricalAgainstContext("project_1", saved.artifact, {
      ...context, script: { ...script, sections: [{ ...script.sections[0], segments: [{ ...script.sections[0].segments[0], speechText: "Texto alterado." }] }] },
    })).rejects.toMatchObject({ code: "CORE_REJECTED" });
    files.set(saved.artifact.fileName, new Blob(["corrupt"]));
    await expect(review.readHistoricalAgainstContext("project_1", saved.artifact, context)).rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
    state.close();
  });

  it("detects a checkpoint change during the historical read", async () => {
    const { state, persistence, review } = setup("review-read-race");
    const input = await submission();
    await persistence.persist({
      schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: input.sourceHash,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: [],
    }, []);
    const saved = await review.save("project_1", context, input);
    const originalLoad = persistence.loadLatest.bind(persistence);
    let reads = 0;
    persistence.loadLatest = async projectId => {
      reads += 1;
      if (reads === 2) {
        const current = await originalLoad(projectId);
        const { sequence: _sequence, checksum: _checksum, ...draft } = current!;
        await persistence.persistNext({ ...draft, createdAtMs: current!.createdAtMs + 1 }, [], current!.checksum);
      }
      return await originalLoad(projectId);
    };
    await expect(review.readHistoricalAgainstContext("project_1", saved.artifact, context))
      .rejects.toMatchObject({ code: "CHECKPOINT_CHANGED" });
    state.close();
  });
});

describe("active narrative persistence", () => {
  it("rejects activation after verification or with audio artifacts", async () => {
    const input = await submission();
    const ready = setup("active-ready-state");
    await ready.persistence.persist({
      schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: input.sourceHash,
      job: { state: "READY_FOR_AUDIO", resumeState: null }, artifactKeys: [],
    }, []);
    await expect(ready.active.activate("project_1", context)).rejects.toMatchObject({ code: "CORE_REJECTED" });
    ready.state.close();

    const withAudio = setup("active-audio-reference");
    await withAudio.persistence.persist({
      schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: input.sourceHash,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: ["audio_1"],
    }, [{
      projectId: "project_1", artifactKey: "audio_1", kind: "audio_chunk",
      value: new Blob(["old audio"]), mediaType: "audio/wav", createdAtMs: 1,
      regenerable: true, pinned: false, finalArtifact: false, expiresAtMs: null,
    }]);
    await expect(withAudio.active.activate("project_1", context))
      .rejects.toMatchObject({ code: "AUDIO_ARTIFACT_PRESENT" });
    withAudio.state.close();
  });

  it("publishes one active Rust identity and rejects an old script after replacement", async () => {
    const { state, persistence, active } = setup("active-narrative-swap");
    const input = await submission();
    await persistence.persist({
      schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: input.sourceHash,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: [],
    }, []);
    const first = await active.activate("project_1", context);
    expect(first.artifact).toMatchObject({ kind: "active_narrative", pinned: true, regenerable: false });
    await expect(active.loadActiveAgainstContext("project_1", context))
      .resolves.toMatchObject({ identity: first.identity });
    const changedContext = {
      ...context, script: { ...script, sections: [{ ...script.sections[0], segments: [{
        ...script.sections[0].segments[0], speechText: "Outro texto falado.",
      }] }] },
    };
    await expect(active.loadActiveAgainstContext("project_1", changedContext))
      .rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
    const second = await active.activate("project_1", changedContext);
    expect(second.identity.identityHash).not.toBe(first.identity.identityHash);
    expect(second.checkpoint.artifactKeys).toContain(second.artifact.artifactKey);
    expect(second.checkpoint.artifactKeys).not.toContain(first.artifact.artifactKey);
    await expect(active.loadActiveAgainstContext("project_1", context))
      .rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
    await expect(active.loadActiveAgainstContext("project_1", changedContext))
      .resolves.toMatchObject({ identity: second.identity });
    expect(await persistence.loadArtifactRecord("project_1", first.artifact.artifactKey)).not.toBeNull();
    const latest = await persistence.loadLatest("project_1");
    const { sequence: _sequence, checksum: _checksum, ...draft } = latest!;
    await persistence.persistNext({
      ...draft, createdAtMs: latest!.createdAtMs + 1,
      artifactKeys: [...latest!.artifactKeys, first.artifact.artifactKey],
    }, [], latest!.checksum);
    await expect(active.loadActiveAgainstContext("project_1", changedContext))
      .rejects.toMatchObject({ code: "MULTIPLE_ACTIVE" });
    state.close();
  });

  it("fails closed for a missing or corrupt active artifact", async () => {
    const { state, files, persistence, active } = setup("active-narrative-corrupt");
    const input = await submission();
    await persistence.persist({
      schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: input.sourceHash,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: [],
    }, []);
    const record = await active.activate("project_1", context);
    const original = files.get(record.artifact.fileName)!;
    files.set(record.artifact.fileName, new Blob(["corrupt"]));
    await expect(active.loadActiveAgainstContext("project_1", context))
      .rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
    files.delete(record.artifact.fileName);
    await expect(active.loadActiveAgainstContext("project_1", context))
      .rejects.toMatchObject({ code: "READ_FAILED" });
    files.set(record.artifact.fileName, original);
    const originalLoad = persistence.loadLatest.bind(persistence);
    let reads = 0;
    persistence.loadLatest = async projectId => {
      reads += 1;
      if (reads === 2) {
        const current = await originalLoad(projectId);
        const { sequence: _sequence, checksum: _checksum, ...draft } = current!;
        await persistence.persistNext({ ...draft, createdAtMs: current!.createdAtMs + 1 }, [], current!.checksum);
      }
      return await originalLoad(projectId);
    };
    await expect(active.loadActiveAgainstContext("project_1", context))
      .rejects.toMatchObject({ code: "CHECKPOINT_CHANGED" });
    state.close();
  });
});

describe("active review evaluation", () => {
  it("revalidates a historical review only against the active context, without attestation", async () => {
    const { state, persistence, active, review, evaluator } = setup("active-review-roundtrip");
    const input = await submission();
    await persistence.persist({
      schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: input.sourceHash,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: [],
    }, []);
    const historical = await review.save("project_1", context, input);
    await expect(evaluator.evaluate("project_1", historical.artifact, context))
      .rejects.toMatchObject({ code: "NO_ACTIVE_NARRATIVE" });
    const published = await active.activate("project_1", context);
    const legacyResult = await evaluator.evaluate("project_1", historical.artifact, context);
    expect(legacyResult.evaluation.status).toBe("not_established");
    const bound = await review.saveForActive("project_1", context, input);
    expect(bound.artifact.artifactKey).not.toBe(historical.artifact.artifactKey);
    const result = await evaluator.evaluate("project_1", bound.artifact, context);
    expect(result.evaluation).toMatchObject({
      activeIdentityHash: published.identity.identityHash,
      submissionHash: historical.receipt.submissionHash,
      bindingHash: bound.bindingHash,
      status: "bound_unverified",
    });
    expect(result.receipt.attestationStatus).toBe("unverified");
    expect(result.checkpoint.checksum).not.toBe(published.checkpoint.checksum);

    const changedOutline = {
      ...context, outline: { ...outline, sections: [{ ...outline.sections[0], requiresReview: false }] },
    };
    await active.activate("project_1", changedOutline);
    await expect(review.readHistoricalAgainstContext("project_1", bound.artifact, context))
      .resolves.toMatchObject({ bindingHash: bound.bindingHash, currentness: "not_established" });
    await expect(evaluator.evaluate("project_1", bound.artifact, context))
      .rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
    await expect(evaluator.evaluate("project_1", bound.artifact, changedOutline))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    const rebound = await review.saveForActive("project_1", changedOutline, input);
    expect(rebound.bindingHash).not.toBe(bound.bindingHash);
    expect(rebound.artifact.artifactKey).not.toBe(bound.artifact.artifactKey);
    await expect(evaluator.evaluate("project_1", rebound.artifact, changedOutline))
      .resolves.toMatchObject({ evaluation: { status: "bound_unverified" } });

    const changed = {
      ...context, script: { ...script, sections: [{ ...script.sections[0], segments: [{
        ...script.sections[0].segments[0], speechText: "Outro texto falado.",
      }] }] },
    };
    await active.activate("project_1", changed);
    await expect(evaluator.evaluate("project_1", bound.artifact, context))
      .rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
    await expect(evaluator.evaluate("project_1", bound.artifact, changed))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    state.close();
  });

  it("rejects a checkpoint change after both artifacts were read", async () => {
    const { state, persistence, active, review, evaluator } = setup("active-review-race");
    const input = await submission();
    await persistence.persist({
      schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: input.sourceHash,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: [],
    }, []);
    await active.activate("project_1", context);
    const historical = await review.save("project_1", context, input);
    const originalLoad = persistence.loadLatest.bind(persistence);
    let reads = 0;
    persistence.loadLatest = async projectId => {
      reads += 1;
      if (reads === 5) {
        const current = await originalLoad(projectId);
        const { sequence: _sequence, checksum: _checksum, ...draft } = current!;
        await persistence.persistNext({ ...draft, createdAtMs: current!.createdAtMs + 1 }, [], current!.checksum);
      }
      return await originalLoad(projectId);
    };
    await expect(evaluator.evaluate("project_1", historical.artifact, context))
      .rejects.toMatchObject({ code: "CHECKPOINT_CHANGED" });
    state.close();
  });

  it("rejects corruption of either pinned artifact", async () => {
    const { state, files, persistence, active, review, evaluator } = setup("active-review-corruption");
    const input = await submission();
    await persistence.persist({
      schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: input.sourceHash,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: [],
    }, []);
    const published = await active.activate("project_1", context);
    const bound = await review.saveForActive("project_1", context, input);
    const originalActive = files.get(published.artifact.fileName)!;
    files.set(published.artifact.fileName, new Blob(["corrupt active"]));
    await expect(evaluator.evaluate("project_1", bound.artifact, context))
      .rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
    files.set(published.artifact.fileName, originalActive);
    files.set(bound.artifact.fileName, new Blob(["corrupt review"]));
    await expect(evaluator.evaluate("project_1", bound.artifact, context))
      .rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
    state.close();
  });
});

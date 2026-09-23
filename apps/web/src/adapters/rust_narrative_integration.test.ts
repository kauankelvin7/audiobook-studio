import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import contentFixture from "../../../../tests/fixtures/content_model_v1.json";
import outlineFixture from "../../../../tests/fixtures/semantic_outline_v1.json";
import planFixture from "../../../../tests/fixtures/narrative_plan_content_v1.json";
import scriptFixture from "../../../../tests/fixtures/narrative_script_content_v1.json";
import { buildNarrationQa, validateNarrativePlan } from "./rust_narrative_pipeline";
import { buildActiveNarrativeIdentity, buildScriptQa, buildScriptReviewPacket, validateActiveNarrativeActivation, validateScriptReviewSubmission } from "./rust_script_pipeline";

const wasmPath = fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url));
initSync({ module: readFileSync(wasmPath) });

describe("real Rust narrative WASM boundary", () => {
  it("validates the shared plan and returns contextual QA from Rust", async () => {
    await expect(validateNarrativePlan(planFixture, contentFixture, outlineFixture)).resolves.toBeUndefined();
    const qa = await buildNarrationQa("plan_1", planFixture, contentFixture, outlineFixture, {
      section_1: "PR0CEDURE DIVISI0N",
    });
    expect(qa).toMatchObject({
      planId: "plan_1",
      status: "review",
      documentSections: 1,
      narrativeSections: 1,
      duplicatedSpokenHeadings: 0,
      unsupportedClaims: 0,
    });
    expect(qa.warnings.map(warning => warning.code)).toContain("CLAIM_GROUNDING_NOT_EVALUATED");
  });

  it("rejects fabricated provenance in the Rust core", async () => {
    const fabricated = {
      ...planFixture,
      sections: [{ ...planFixture.sections[0], sourceRefs: ["fabricated"] }],
    };
    await expect(validateNarrativePlan(fabricated, contentFixture, outlineFixture))
      .rejects.toMatchObject({ code: "CORE_REJECTED", cause: expect.stringContaining("fabricated") });
    await expect(buildNarrationQa("plan_1", fabricated, contentFixture, outlineFixture, { section_1: "Text" }))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });

  it("validates script mapping in real WASM and retains claim review", async () => {
    const qa = await buildScriptQa("plan_1", scriptFixture, planFixture, contentFixture, outlineFixture);
    expect(qa).toMatchObject({ planId: "plan_1", status: "review", unsupportedClaims: 0 });
    expect(qa.warnings.map(warning => warning.code)).toContain("CLAIM_GROUNDING_NOT_EVALUATED");
    await expect(buildScriptQa("another_plan", scriptFixture, planFixture, contentFixture, outlineFixture))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });

    const invented = {
      ...scriptFixture,
      sections: [{
        ...scriptFixture.sections[0],
        segments: [{ ...scriptFixture.sections[0].segments[0], sourceRefs: ["fabricated"] }],
      }],
    };
    await expect(buildScriptQa("plan_1", invented, planFixture, contentFixture, outlineFixture))
      .rejects.toMatchObject({ code: "CORE_REJECTED", cause: expect.stringContaining("fabricated") });

    const unmapped = {
      ...scriptFixture,
      sections: [{
        ...scriptFixture.sections[0],
        segments: [{ ...scriptFixture.sections[0].segments[0], sourceRefs: [] }],
      }],
    };
    await expect(buildScriptQa("plan_1", unmapped, planFixture, contentFixture, outlineFixture))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("builds a pending review packet with source text and content identities", async () => {
    const packet = await buildScriptReviewPacket("plan_1", scriptFixture, planFixture, contentFixture, outlineFixture);
    expect(packet).toMatchObject({
      planId: "plan_1",
      documentId: contentFixture.documentId,
      sourceHash: contentFixture.sourceHash,
      methodVersion: "script-review-packet-rust-v1",
      segments: [{
        sectionId: "section_1",
        segmentId: "segment_1",
        reviewStatus: "pending",
        sources: [{
          sourceRef: "r_1_1",
          sourceUnitId: "unit_r_1_1",
          analysisText: "PR0CEDURE DIVISI0N",
          qualityStatus: "review_required",
        }],
      }],
    });
    expect(packet.scriptHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(packet.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(packet.planHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const changed = {
      ...scriptFixture,
      sections: [{
        ...scriptFixture.sections[0],
        segments: [{ ...scriptFixture.sections[0].segments[0], speechText: "Outro texto falado." }],
      }],
    };
    const changedPacket = await buildScriptReviewPacket("plan_1", changed, planFixture, contentFixture, outlineFixture);
    expect(changedPacket.scriptHash).not.toBe(packet.scriptHash);
    expect(changedPacket.contentHash).toBe(packet.contentHash);
    await expect(buildScriptReviewPacket("other", scriptFixture, planFixture, contentFixture, outlineFixture))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    const forgedContent = {
      ...contentFixture,
      sourceHash: `sha256:${"1".repeat(64)}`,
    };
    await expect(buildScriptReviewPacket("plan_1", scriptFixture, planFixture, forgedContent, outlineFixture))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });

  it("builds active narrative identity from the real Rust/WASM dependency hashes", async () => {
    const packet = await buildScriptReviewPacket("plan_1", scriptFixture, planFixture, contentFixture, outlineFixture);
    const identity = await buildActiveNarrativeIdentity("plan_1", scriptFixture, planFixture, contentFixture, outlineFixture);
    expect(identity).toMatchObject({
      planId: packet.planId, documentId: packet.documentId, sourceHash: packet.sourceHash,
      contentHash: packet.contentHash, planHash: packet.planHash, scriptHash: packet.scriptHash,
      methodVersion: "active-narrative-rust-v1",
    });
    expect(identity.identityHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(identity.outlineHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const changed = {
      ...scriptFixture,
      sections: [{ ...scriptFixture.sections[0], segments: [{
        ...scriptFixture.sections[0].segments[0], speechText: "Texto alterado.",
      }] }],
    };
    const changedIdentity = await buildActiveNarrativeIdentity("plan_1", changed, planFixture, contentFixture, outlineFixture);
    expect(changedIdentity.identityHash).not.toBe(identity.identityHash);
    const changedOutline = {
      ...outlineFixture,
      sections: [{ ...outlineFixture.sections[0], requiresReview: false }],
    };
    const outlineIdentity = await buildActiveNarrativeIdentity("plan_1", scriptFixture, planFixture, contentFixture, changedOutline);
    expect(outlineIdentity.outlineHash).not.toBe(identity.outlineHash);
    expect(outlineIdentity.identityHash).not.toBe(identity.identityHash);
    await expect(validateActiveNarrativeActivation({ state: "VERIFYING", resumeState: null })).resolves.toBeUndefined();
    await expect(validateActiveNarrativeActivation({ state: "READY_FOR_AUDIO", resumeState: null }))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });

  it("validates a decision against current hashes without attesting or approving it", async () => {
    const packet = await buildScriptReviewPacket("plan_1", scriptFixture, planFixture, contentFixture, outlineFixture);
    const submission = {
      schemaVersion: 1,
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
    const receipt = await validateScriptReviewSubmission(
      "plan_1", scriptFixture, planFixture, contentFixture, outlineFixture, submission,
    );
    expect(receipt).toMatchObject({
      planId: packet.planId,
      documentId: packet.documentId,
      sourceHash: packet.sourceHash,
      contentHash: packet.contentHash,
      planHash: packet.planHash,
      scriptHash: packet.scriptHash,
      submissionHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      reviewedSegments: 1,
      attestationStatus: "unverified",
    });
    await expect(validateScriptReviewSubmission(
      "plan_1", scriptFixture, planFixture, contentFixture, outlineFixture,
      { ...submission, scriptHash: `sha256:${"0".repeat(64)}` },
    )).rejects.toMatchObject({ code: "CORE_REJECTED", cause: expect.stringContaining("current") });
    await expect(validateScriptReviewSubmission(
      "plan_1", scriptFixture, planFixture, contentFixture, outlineFixture,
      { ...submission, decisions: [{ ...submission.decisions[0], evidenceSourceUnitIds: ["fabricated"] }] },
    )).rejects.toMatchObject({ code: "CORE_REJECTED", cause: expect.stringContaining("unknown evidence") });

    const textlessContent = {
      ...contentFixture,
      sourceUnits: [{ ...contentFixture.sourceUnits[0], analysisText: null }],
    };
    const textlessPacket = await buildScriptReviewPacket(
      "plan_1", scriptFixture, planFixture, textlessContent, outlineFixture,
    );
    const textlessSubmission = {
      ...submission,
      contentHash: textlessPacket.contentHash,
    };
    await expect(validateScriptReviewSubmission(
      "plan_1", scriptFixture, planFixture, textlessContent, outlineFixture, textlessSubmission,
    )).rejects.toMatchObject({ code: "CORE_REJECTED", cause: expect.stringContaining("source text") });
    await expect(validateScriptReviewSubmission(
      "plan_1", scriptFixture, planFixture, textlessContent, outlineFixture,
      { ...textlessSubmission, decisions: [{ ...submission.decisions[0], verdict: "needs_evidence", evidenceSourceUnitIds: [] }] },
    )).resolves.toMatchObject({ attestationStatus: "unverified" });
  });

  it("accepts a transition-only source reference and rejects an unrelated one", async () => {
    const content = {
      ...contentFixture,
      sourceUnits: [
        ...contentFixture.sourceUnits,
        { ...contentFixture.sourceUnits[0], id: "unit_r_1_2", sourceRefs: ["r_1_2"] },
      ],
    };
    const outline = {
      ...outlineFixture,
      sections: [{
        ...outlineFixture.sections[0],
        sourceUnitIds: ["unit_r_1_1", "unit_r_1_2"],
        candidateNarrationUnitIds: ["unit_r_1_1", "unit_r_1_2"],
      }],
    };
    const plan = {
      ...planFixture,
      sections: [{
        ...planFixture.sections[0],
        transition: { text: "Ligação", relation: "sequence", sourceRefs: ["r_1_2"] },
      }],
    };
    const script = {
      ...scriptFixture,
      sections: [{
        ...scriptFixture.sections[0],
        segments: [{ ...scriptFixture.sections[0].segments[0], sourceRefs: ["r_1_2"] }],
      }],
    };
    await expect(buildScriptQa("plan_1", script, plan, content, outline))
      .resolves.toMatchObject({ status: "review" });
    script.sections[0].segments[0].sourceRefs = ["unrelated"];
    await expect(buildScriptQa("plan_1", script, plan, content, outline))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });

  it("does not accept partial evidence for a segment with multiple source refs", async () => {
    const content = {
      ...contentFixture,
      sourceUnits: [
        ...contentFixture.sourceUnits,
        { ...contentFixture.sourceUnits[0], id: "unit_r_1_2", sourceRefs: ["r_1_2"], analysisText: null },
      ],
    };
    const outline = {
      ...outlineFixture,
      sections: [{
        ...outlineFixture.sections[0],
        sourceUnitIds: ["unit_r_1_1", "unit_r_1_2"],
        candidateNarrationUnitIds: ["unit_r_1_1", "unit_r_1_2"],
      }],
    };
    const plan = {
      ...planFixture,
      sections: [{
        ...planFixture.sections[0],
        transition: { text: "Ligação", relation: "sequence", sourceRefs: ["r_1_2"] },
      }],
    };
    const script = {
      ...scriptFixture,
      sections: [{
        ...scriptFixture.sections[0],
        segments: [{ ...scriptFixture.sections[0].segments[0], sourceRefs: ["r_1_1", "r_1_2"] }],
      }],
    };
    const packet = await buildScriptReviewPacket("plan_1", script, plan, content, outline);
    const submission = {
      schemaVersion: 1,
      planId: packet.planId,
      documentId: packet.documentId,
      sourceHash: packet.sourceHash,
      contentHash: packet.contentHash,
      planHash: packet.planHash,
      scriptHash: packet.scriptHash,
      decisions: [{
        segmentId: packet.segments[0].segmentId,
        verdict: "supported",
        evidenceSourceUnitIds: ["unit_r_1_1"],
        rationale: "Trecho conferido com a fonte indicada.",
      }],
    };
    await expect(validateScriptReviewSubmission("plan_1", script, plan, content, outline, submission))
      .rejects.toMatchObject({ code: "CORE_REJECTED", cause: expect.stringContaining("r_1_2") });
  });
});

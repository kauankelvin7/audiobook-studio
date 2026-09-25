import { describe, expect, it, vi } from "vitest";
import content from "../../../../tests/fixtures/content_model_v1.json";
import outline from "../../../../tests/fixtures/semantic_outline_v1.json";
import plan from "../../../../tests/fixtures/narrative_plan_content_v1.json";
import script from "../../../../tests/fixtures/narrative_script_content_v1.json";
import { buildActiveNarrativeIdentity, buildScriptQa, buildScriptReviewPacket, evaluateReviewAgainstActive, validateActiveNarrativeActivation, validateScriptReviewSubmission } from "./rust_script_pipeline";

const qa = {
  schemaVersion: 1,
  planId: "plan_1",
  status: "review",
  documentSections: 1,
  narrativeSections: 1,
  spokenChapters: 1,
  duplicatedSpokenHeadings: 0,
  unsupportedClaims: 0,
  warnings: [{ code: "CLAIM_GROUNDING_NOT_EVALUATED", sectionId: null, message: "Claim grounding requires a separate review." }],
  methodVersion: "narrative-quality-rust-v1",
};

describe("Rust script boundary", () => {
  it("forwards the expected plan identity and structured inputs", async () => {
    const port = {
      initialize: vi.fn(async () => undefined),
      buildQa: vi.fn(() => JSON.stringify(qa)),
    };
    await expect(buildScriptQa("plan_1", script, plan, content, outline, port)).resolves.toEqual(qa);
    expect(port.buildQa).toHaveBeenCalledWith(
      "plan_1", JSON.stringify(script), JSON.stringify(plan), JSON.stringify(content), JSON.stringify(outline),
    );
  });

  it("types review packet boundary failures without accepting fabricated approval", async () => {
    const port = {
      initialize: vi.fn(async () => undefined),
      buildPacket: vi.fn(() => JSON.stringify({ ...qa, status: "pass" })),
    };
    await expect(buildScriptReviewPacket("", script, plan, content, outline, port))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(port.initialize).not.toHaveBeenCalled();
    await expect(buildScriptReviewPacket("plan_1", script, plan, content, outline, port))
      .rejects.toMatchObject({ code: "INVALID_CORE_OUTPUT" });
    const failedInit = { ...port, initialize: vi.fn(async () => { throw new Error("load failed"); }) };
    await expect(buildScriptReviewPacket("plan_1", script, plan, content, outline, failedInit))
      .rejects.toMatchObject({ code: "WASM_INIT_FAILED" });
    const rejected = { ...port, buildPacket: vi.fn((): string => { throw new Error("bad mapping"); }) };
    await expect(buildScriptReviewPacket("plan_1", script, plan, content, outline, rejected))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });

  it("rejects invalid or fabricated active identity at the WASM boundary", async () => {
    const port = {
      initialize: vi.fn(async () => undefined),
      buildIdentity: vi.fn(() => JSON.stringify({ ...qa, identityHash: `sha256:${"0".repeat(64)}` })),
    };
    await expect(buildActiveNarrativeIdentity("", script, plan, content, outline, port))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(buildActiveNarrativeIdentity("plan_1", script, plan, content, outline, port))
      .rejects.toMatchObject({ code: "INVALID_CORE_OUTPUT" });
    const failedInit = { ...port, initialize: vi.fn(async () => { throw new Error("load failed"); }) };
    await expect(buildActiveNarrativeIdentity("plan_1", script, plan, content, outline, failedInit))
      .rejects.toMatchObject({ code: "WASM_INIT_FAILED" });
    const rejected = { ...port, buildIdentity: vi.fn((): string => { throw new Error("stale"); }) };
    await expect(buildActiveNarrativeIdentity("plan_1", script, plan, content, outline, rejected))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });

  it("types activation-state boundary failures", async () => {
    const port = { initialize: vi.fn(async () => undefined), validateJob: vi.fn() };
    await expect(validateActiveNarrativeActivation({}, port)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(port.initialize).not.toHaveBeenCalled();
    await expect(validateActiveNarrativeActivation({ state: "VERIFYING", resumeState: null }, port)).resolves.toBeUndefined();
    const failedInit = { ...port, initialize: vi.fn(async () => { throw new Error("load failed"); }) };
    await expect(validateActiveNarrativeActivation({ state: "VERIFYING", resumeState: null }, failedInit))
      .rejects.toMatchObject({ code: "WASM_INIT_FAILED" });
    const rejected = { ...port, validateJob: vi.fn(() => { throw new Error("wrong state"); }) };
    await expect(validateActiveNarrativeActivation({ state: "READY_FOR_AUDIO", resumeState: null }, rejected))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });

  it("types active-review boundary failures and rejects fabricated output", async () => {
    const hash = `sha256:${"0".repeat(64)}`;
    const input = {
      schemaVersion: 1, planId: "plan_1", documentId: content.documentId,
      sourceHash: content.sourceHash, contentHash: hash, planHash: hash, scriptHash: hash,
      decisions: [{ segmentId: "segment_1", verdict: "supported", evidenceSourceUnitIds: ["unit_r_1_1"], rationale: "Fonte conferida." }],
    };
    const port = {
      initialize: vi.fn(async () => undefined),
      evaluate: vi.fn(() => JSON.stringify({
        schemaVersion: 1, activeIdentityHash: hash, submissionHash: hash, bindingHash: hash,
        status: "verified", methodVersion: "active-review-evaluation-rust-v1",
      })),
    };
    await expect(evaluateReviewAgainstActive("", script, plan, content, outline, input, hash, null, port))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(port.initialize).not.toHaveBeenCalled();
    await expect(evaluateReviewAgainstActive("plan_1", script, plan, content, outline, input, hash, null, port))
      .rejects.toMatchObject({ code: "INVALID_CORE_OUTPUT" });
    const failedInit = { ...port, initialize: vi.fn(async () => { throw new Error("load failed"); }) };
    await expect(evaluateReviewAgainstActive("plan_1", script, plan, content, outline, input, hash, null, failedInit))
      .rejects.toMatchObject({ code: "WASM_INIT_FAILED" });
    const rejected = { ...port, evaluate: vi.fn((): string => { throw new Error("stale"); }) };
    await expect(evaluateReviewAgainstActive("plan_1", script, plan, content, outline, input, hash, null, rejected))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });

  it("types submission boundary failures and rejects forged attestation", async () => {
    const hash = `sha256:${"0".repeat(64)}`;
    const submission = {
      schemaVersion: 1,
      planId: "plan_1",
      documentId: content.documentId,
      sourceHash: content.sourceHash,
      contentHash: hash,
      planHash: hash,
      scriptHash: hash,
      decisions: [{ segmentId: "segment_1", verdict: "supported", evidenceSourceUnitIds: ["unit_r_1_1"], rationale: "Fonte indicada." }],
    };
    const port = {
      initialize: vi.fn(async () => undefined),
      recordSubmission: vi.fn(() => JSON.stringify({
        schemaVersion: 1, sourceHash: content.sourceHash, contentHash: hash, planHash: hash, scriptHash: hash,
        reviewedSegments: 1, attestationStatus: "verified", methodVersion: "forged",
      })),
    };
    await expect(validateScriptReviewSubmission("", script, plan, content, outline, submission, port))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(port.initialize).not.toHaveBeenCalled();
    await expect(validateScriptReviewSubmission("plan_1", script, plan, content, outline, {}, port))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(validateScriptReviewSubmission("plan_1", script, plan, content, outline, submission, port))
      .rejects.toMatchObject({ code: "INVALID_CORE_OUTPUT" });
    const wrongHash = { ...port, recordSubmission: vi.fn(() => JSON.stringify({
      schemaVersion: 1, planId: "plan_1", documentId: content.documentId,
      sourceHash: content.sourceHash, contentHash: hash, planHash: hash,
      scriptHash: `sha256:${"1".repeat(64)}`, submissionHash: hash,
      reviewedSegments: 1, attestationStatus: "unverified", methodVersion: "test",
    })) };
    await expect(validateScriptReviewSubmission("plan_1", script, plan, content, outline, submission, wrongHash))
      .rejects.toMatchObject({ code: "INVALID_CORE_OUTPUT" });
    const failedInit = { ...port, initialize: vi.fn(async () => { throw new Error("load failed"); }) };
    await expect(validateScriptReviewSubmission("plan_1", script, plan, content, outline, submission, failedInit))
      .rejects.toMatchObject({ code: "WASM_INIT_FAILED" });
    const rejected = { ...port, recordSubmission: vi.fn((): string => { throw new Error("stale"); }) };
    await expect(validateScriptReviewSubmission("plan_1", script, plan, content, outline, submission, rejected))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });

  it("types invalid input, initialization, core, and output failures", async () => {
    const port = {
      initialize: vi.fn(async () => undefined),
      buildQa: vi.fn(() => JSON.stringify(qa)),
    };
    await expect(buildScriptQa("", script, plan, content, outline, port))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(buildScriptQa("plan_1", { ...script, sections: [] }, plan, content, outline, port))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(port.initialize).not.toHaveBeenCalled();

    const failedInit = { ...port, initialize: vi.fn(async () => { throw new Error("load failed"); }) };
    await expect(buildScriptQa("plan_1", script, plan, content, outline, failedInit))
      .rejects.toMatchObject({ code: "WASM_INIT_FAILED" });
    const rejected = { ...port, buildQa: vi.fn((): string => { throw new Error("invalid mapping"); }) };
    await expect(buildScriptQa("plan_1", script, plan, content, outline, rejected))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    const malformed = { ...port, buildQa: vi.fn(() => "not JSON") };
    await expect(buildScriptQa("plan_1", script, plan, content, outline, malformed))
      .rejects.toMatchObject({ code: "INVALID_CORE_OUTPUT" });
    const invalidQa = { ...port, buildQa: vi.fn(() => JSON.stringify({ ...qa, status: "pass", unsupportedClaims: 1 })) };
    await expect(buildScriptQa("plan_1", script, plan, content, outline, invalidQa))
      .rejects.toMatchObject({ code: "INVALID_CORE_OUTPUT" });
  });
});

import { describe, expect, it, vi } from "vitest";
import content from "../../../../tests/fixtures/content_model_v1.json";
import outline from "../../../../tests/fixtures/semantic_outline_v1.json";
import plan from "../../../../tests/fixtures/narrative_plan_content_v1.json";
import script from "../../../../tests/fixtures/narrative_script_content_v1.json";
import { buildScriptQa, buildScriptReviewPacket } from "./rust_script_pipeline";

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

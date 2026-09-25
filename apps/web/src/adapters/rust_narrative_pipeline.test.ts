import { describe, expect, it, vi } from "vitest";
import contentFixture from "../../../../tests/fixtures/content_model_v1.json";
import outlineFixture from "../../../../tests/fixtures/semantic_outline_v1.json";
import { buildNarrationQa, validateNarrativePlan } from "./rust_narrative_pipeline";

const plan = {
  schemaVersion: 1,
  documentId: contentFixture.documentId,
  sections: [{
    id: "section_1",
    sourceRefs: ["r_1_1"],
    conceptIds: [],
    heading: null,
    transition: null,
    spokenChapterId: "chapter_1",
    estimatedSeconds: null,
  }],
  spokenChapters: [{ id: "chapter_1", sectionIds: ["section_1"], displayTitle: "COBOL" }],
};

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

describe("Rust narrative boundary", () => {
  it("passes validated contracts to the WASM port and parses QA output", async () => {
    const port = {
      initialize: vi.fn(async () => undefined),
      validate: vi.fn(() => undefined),
      buildQa: vi.fn(() => JSON.stringify(qa)),
    };
    await validateNarrativePlan(plan, contentFixture, outlineFixture, port);
    expect(port.validate).toHaveBeenCalledWith(JSON.stringify(plan), JSON.stringify(contentFixture), JSON.stringify(outlineFixture));

    await expect(buildNarrationQa("plan_1", plan, contentFixture, outlineFixture, { section_1: "Body" }, port))
      .resolves.toEqual(qa);
    expect(port.buildQa).toHaveBeenCalledWith(
      "plan_1", JSON.stringify(plan), JSON.stringify(contentFixture), JSON.stringify(outlineFixture),
      JSON.stringify({ section_1: "Body" }),
    );
  });

  it("rejects invalid input before calling WASM and preserves typed failures", async () => {
    const port = {
      initialize: vi.fn(async () => undefined),
      validate: vi.fn(() => { throw new Error("core rejected"); }),
      buildQa: vi.fn(() => "not JSON"),
    };
    await expect(validateNarrativePlan({ ...plan, schemaVersion: 2 }, contentFixture, outlineFixture, port))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(port.initialize).not.toHaveBeenCalled();
    await expect(validateNarrativePlan(plan, contentFixture, outlineFixture, port))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    await expect(buildNarrationQa("plan_1", plan, contentFixture, outlineFixture, { section_1: "Body" }, port))
      .rejects.toMatchObject({ code: "INVALID_CORE_OUTPUT" });
    const circular: Record<string, unknown> = {};
    circular.section_1 = circular;
    await expect(buildNarrationQa("plan_1", plan, contentFixture, outlineFixture, circular as Record<string, string>, port))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(buildNarrationQa("plan_1", plan, contentFixture, outlineFixture, { section_1: 3 } as never, port))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });

    const initFailure = { ...port, initialize: vi.fn(async () => { throw new Error("load failed"); }) };
    await expect(validateNarrativePlan(plan, contentFixture, outlineFixture, initFailure))
      .rejects.toMatchObject({ code: "WASM_INIT_FAILED" });

    const invalidOutput = { ...port, buildQa: vi.fn(() => JSON.stringify({ ...qa, status: "pass", unsupportedClaims: 1 })) };
    await expect(buildNarrationQa("plan_1", plan, contentFixture, outlineFixture, { section_1: "Body" }, invalidOutput))
      .rejects.toMatchObject({ code: "INVALID_CORE_OUTPUT" });
  });
});

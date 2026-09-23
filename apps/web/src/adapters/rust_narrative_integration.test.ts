import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import contentFixture from "../../../../tests/fixtures/content_model_v1.json";
import outlineFixture from "../../../../tests/fixtures/semantic_outline_v1.json";
import planFixture from "../../../../tests/fixtures/narrative_plan_content_v1.json";
import { buildNarrationQa, validateNarrativePlan } from "./rust_narrative_pipeline";

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
});

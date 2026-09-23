import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import contentFixture from "../../../../tests/fixtures/content_model_v1.json";
import outlineFixture from "../../../../tests/fixtures/semantic_outline_v1.json";
import planFixture from "../../../../tests/fixtures/narrative_plan_content_v1.json";
import scriptFixture from "../../../../tests/fixtures/narrative_script_content_v1.json";
import { buildNarrationQa, validateNarrativePlan } from "./rust_narrative_pipeline";
import { buildScriptQa } from "./rust_script_pipeline";

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
});

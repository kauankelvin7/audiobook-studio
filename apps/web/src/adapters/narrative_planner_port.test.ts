import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import contentFixture from "../../../../tests/fixtures/content_model_v1.json";
import outlineFixture from "../../../../tests/fixtures/semantic_outline_v1.json";
import planFixture from "../../../../tests/fixtures/narrative_plan_content_v1.json";
import { proposeNarrativePlan } from "./narrative_planner_port";
import { FixtureNarrativePlanner } from "./testing/fixture_narrative_planner";

const wasmPath = fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url));
initSync({ module: readFileSync(wasmPath) });

describe("NarrativePlannerPort boundary", () => {
  it("accepts a structured fixture only after Rust provenance validation", async () => {
    const port = new FixtureNarrativePlanner(planFixture);
    await expect(proposeNarrativePlan(port, contentFixture, outlineFixture)).resolves.toEqual({
      kind: "candidate", qa: "pending", plan: planFixture,
    });
    expect(port.calls).toEqual([{ contentModel: contentFixture, semanticOutline: outlineFixture }]);
  });

  it("types context, model, schema and Rust rejection failures", async () => {
    const port = new FixtureNarrativePlanner(planFixture);
    await expect(proposeNarrativePlan(port, { ...contentFixture, schemaVersion: 2 }, outlineFixture))
      .rejects.toMatchObject({ code: "INVALID_CONTEXT" });
    expect(port.calls).toHaveLength(0);

    await expect(proposeNarrativePlan({ propose: async () => { throw new Error("offline"); } }, contentFixture, outlineFixture))
      .rejects.toMatchObject({ code: "PLANNER_FAILED" });
    await expect(proposeNarrativePlan({ propose: async () => ({ schemaVersion: 1 }) }, contentFixture, outlineFixture))
      .rejects.toMatchObject({ code: "INVALID_OUTPUT" });

    const fabricated = { ...planFixture, sections: [{ ...planFixture.sections[0], sourceRefs: ["fabricated"] }] };
    await expect(proposeNarrativePlan({ propose: async () => fabricated }, contentFixture, outlineFixture))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    await expect(proposeNarrativePlan(port, contentFixture, { ...outlineFixture, documentId: "other_document" }))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });
});

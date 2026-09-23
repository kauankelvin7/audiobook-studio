import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import initWasm, {
  build_content_model_json,
  build_semantic_outline_json,
  core_version,
  initSync,
  validate_document_v2_json,
} from "../generated/audiobook_wasm/audiobook_wasm.js";
import documentV1Fixture from "../../../../tests/fixtures/document_ir_v1.json";
import documentV2Fixture from "../../../../tests/fixtures/document_ir_v2.json";
import contentFixture from "../../../../tests/fixtures/content_model_v1.json";
import outlineFixture from "../../../../tests/fixtures/semantic_outline_v1.json";
import { documentIrSchema } from "../schemas/document";
import { analyzeDocumentV1 } from "./rust_content_pipeline";

const wasmPath = fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url));
initSync({ module: readFileSync(wasmPath) });

describe("real audiobook-wasm integration", () => {
  it("runs the Rust v1 migration and content pipeline", async () => {
    const analysis = await analyzeDocumentV1(documentIrSchema.parse(documentV1Fixture));
    expect(analysis.documentV2.schemaVersion).toBe(2);
    expect(analysis.documentV2.pages[0].regions.map(region => region.id)).toEqual(["b_1_1", "b_1_2"]);
    expect(analysis.documentV2.pages[0].regions.every(region => region.qualityStatus === "review_required")).toBe(true);
    expect(analysis.contentModel?.sourceUnits.map(unit => unit.sourceRefs[0])).toEqual(["b_1_1", "b_1_2"]);
    expect(analysis.semanticOutline?.sections.flatMap(section => section.sourceUnitIds)).toEqual(["unit_b_1_1", "unit_b_1_2"]);
    expect(core_version()).toBe("0.1.0");
  });

  it("matches checked-in Rust fixtures using actual WASM exports", async () => {
    await initWasm();
    const validated = JSON.parse(validate_document_v2_json(JSON.stringify(documentV2Fixture)));
    const content = JSON.parse(build_content_model_json(JSON.stringify(validated)));
    const outline = JSON.parse(build_semantic_outline_json(JSON.stringify(content)));
    expect(validated).toEqual(documentV2Fixture);
    expect(content).toEqual(contentFixture);
    expect(outline).toEqual(outlineFixture);
  });

  it("rejects invalid v1 input before invoking core", async () => {
    await expect(analyzeDocumentV1({ ...documentV1Fixture, schemaVersion: 99 } as never))
      .rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
  });

  it("keeps pages without selectable text for OCR review", async () => {
    const scanned = documentIrSchema.parse({ ...documentV1Fixture, pages: [{ ...documentV1Fixture.pages[1], number: 1 }] });
    const analysis = await analyzeDocumentV1(scanned);
    expect(analysis.documentV2.pages[0].extractionQuality).toBe("no_text");
    expect(analysis.contentModel).toBeNull();
    expect(analysis.semanticOutline).toBeNull();
  });

  it("quarantines private-use glyphs through the real WASM pipeline", async () => {
    const source = documentIrSchema.parse(documentV1Fixture);
    const suspect = "\uE000";
    source.pages[0].rawText += suspect;
    source.pages[0].blocks[0].text += suspect;
    const analysis = await analyzeDocumentV1(source);
    expect(analysis.documentV2.pages[0].extractionQuality).toBe("corrupted");
    expect(analysis.documentV2.pages[0].rawText).toContain(suspect);
    expect(analysis.documentV2.pages[0].regions[0]).toMatchObject({
      uncertainty: "unsupported",
      qualityStatus: "unusable",
      flags: expect.arrayContaining(["private_use_glyphs_in_native_text"]),
    });
    expect(analysis.documentV2.pages[0].regions[1].qualityStatus).toBe("review_required");
    expect(analysis.contentModel?.sourceUnits[0].narrationEligibility).toBe("blocked");
  });
});

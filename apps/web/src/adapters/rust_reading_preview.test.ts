import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import documentV1Fixture from "../../../../tests/fixtures/document_ir_v1.json";
import { documentIrSchema } from "../schemas/document";
import { analyzeDocumentV1 } from "./rust_content_pipeline";
import { buildReadingPreview, buildReadingSession } from "./rust_reading_preview";

const wasmPath = fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url));
initSync({ module: readFileSync(wasmPath) });

describe("page reading through real Rust/WASM", () => {
  it("returns complete ordered chunks for a native-text page", async () => {
    const analysis = await analyzeDocumentV1(documentIrSchema.parse(documentV1Fixture));
    const preview = await buildReadingPreview(analysis.documentV2, 1);
    expect(preview).toMatchObject({
      documentId: analysis.documentV2.documentId,
      sourceHash: analysis.documentV2.sourceHash,
      pageNumber: 1,
      chunks: [{ regionId: "b_1_1", text: "Olá mundo" }, { regionId: "b_1_2", text: "Trecho incerto" }],
    });
    const session = await buildReadingSession(analysis.documentV2, 1, 1);
    expect(session.pages).toEqual([preview]);
  });

  it("rejects scanned and suspect pages", async () => {
    const source = documentIrSchema.parse(documentV1Fixture);
    const analysis = await analyzeDocumentV1(source);
    await expect(buildReadingPreview(analysis.documentV2, 2)).rejects.toMatchObject({ code: "CORE_REJECTED" });
    await expect(buildReadingSession(analysis.documentV2, 1, 2)).rejects.toMatchObject({ code: "CORE_REJECTED" });
    await expect(buildReadingSession(analysis.documentV2, 1, 11)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    source.pages[0].rawText += "\uE000";
    source.pages[0].blocks[0].text += "\uE000";
    const suspect = await analyzeDocumentV1(source);
    await expect(buildReadingPreview(suspect.documentV2, 1)).rejects.toMatchObject({ code: "CORE_REJECTED" });
  });
});

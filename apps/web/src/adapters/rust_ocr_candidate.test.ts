import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import documentV2Fixture from "../../../../tests/fixtures/document_ir_v2.json";
import { documentIrV2Schema } from "../schemas/ingestion";
import { ocrCandidateSchema } from "../schemas/ocr_candidate";
import { buildOcrCandidateReceipt } from "./rust_ocr_candidate";

const wasmPath = fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url));
initSync({ module: readFileSync(wasmPath) });

function hash(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

describe("real Rust/WASM OCR candidate contract", () => {
  const document = documentIrV2Schema.parse(documentV2Fixture);
  const region = document.pages[0].regions[0];
  const candidate = ocrCandidateSchema.parse({
    schemaVersion: 1,
    documentId: document.documentId,
    sourceHash: document.sourceHash,
    pageNumber: 1,
    regionId: region.id,
    nativeTextHash: hash(region.sources.rawText!),
    imageHash: hash("rendered region bytes"),
    engineId: "fixture-engine",
    engineVersion: "1",
    text: "  RECOVERED  CODE\n",
  });

  it("returns a pending, source-bound receipt without rewriting the OCR text", async () => {
    expect(candidate.text).toBe("  RECOVERED  CODE\n");
    const receipt = await buildOcrCandidateReceipt(document, candidate);
    expect(receipt).toMatchObject({
      documentId: document.documentId,
      sourceHash: document.sourceHash,
      pageNumber: 1,
      regionId: region.id,
      nativeTextHash: candidate.nativeTextHash,
      ocrTextHash: hash(candidate.text),
      status: "pending",
      methodVersion: "ocr-candidate-rust-v1",
    });
    expect(await buildOcrCandidateReceipt(document, candidate)).toEqual(receipt);
    expect((await buildOcrCandidateReceipt(document, { ...candidate, text: `${candidate.text}!` })).receiptHash).not.toBe(receipt.receiptHash);
  });

  it("rejects stale or mismatched candidates through Rust/WASM", async () => {
    await expect(buildOcrCandidateReceipt(document, { ...candidate, nativeTextHash: hash("old text") }))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    await expect(buildOcrCandidateReceipt(document, { ...candidate, pageNumber: 2 }))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    await expect(buildOcrCandidateReceipt(document, { ...candidate, text: " " }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

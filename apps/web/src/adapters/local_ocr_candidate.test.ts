import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import documentFixture from "../../../../tests/fixtures/document_ir_v2.json";
import { documentIrV2Schema } from "../schemas/ingestion";
import { proposeLocalOcrCandidate } from "./local_ocr_candidate";
import { capturePdfOcrRegion } from "./pdf_ocr_crop";

vi.mock("./pdf_ocr_crop", () => ({ capturePdfOcrRegion: vi.fn() }));

const wasmPath = fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url));
initSync({ module: readFileSync(wasmPath) });

const document = documentIrV2Schema.parse(documentFixture);
const region = document.pages[0].regions[0];
const png = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
const hash = (data: string | Uint8Array) => `sha256:${createHash("sha256").update(data).digest("hex")}`;
const crop = {
  schemaVersion: 1 as const, documentId: document.documentId, sourceHash: document.sourceHash,
  pageNumber: 1, regionId: region.id, nativeTextHash: hash(region.sources.rawText!),
  imageHash: hash(new Uint8Array([1, 2, 3])), image: png,
  bbox: [0, 0, 10, 10] as [number, number, number, number],
  pixelWidth: 20, pixelHeight: 20, renderScale: 2 as const,
  methodVersion: "pdfjs-region-crop-v1" as const,
};

describe("local OCR candidate pipeline", () => {
  it("passes verified crop bytes to engine and obtains a pending Rust receipt", async () => {
    vi.mocked(capturePdfOcrRegion).mockResolvedValue(crop);
    const recognize = vi.fn(async (image: Blob) => {
      expect(image).toBe(png);
      return "RECOVERED CODE";
    });
    const result = await proposeLocalOcrCandidate(new Uint8Array([37, 80, 68, 70]), document, 1, region.id,
      { id: "local-test", version: "1", recognize });
    expect(recognize).toHaveBeenCalledOnce();
    expect(result.candidate.imageHash).toBe(crop.imageHash);
    expect(result.receipt).toMatchObject({ status: "pending", imageHash: crop.imageHash, ocrTextHash: hash("RECOVERED CODE") });
  });

  it("rejects abort after the engine starts", async () => {
    vi.mocked(capturePdfOcrRegion).mockResolvedValue(crop);
    const controller = new AbortController();
    const task = proposeLocalOcrCandidate(new Uint8Array(), document, 1, region.id,
      { id: "local-test", version: "1", recognize: async () => new Promise<string>(() => undefined) }, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
  });
});

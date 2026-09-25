import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractPdf } from "./pdf";
import { capturePdfOcrRegion, planPdfRegionCrop, readPdfPageCropPlan } from "./pdf_ocr_crop";
import { PAGE_OCR_TARGET_ID } from "../schemas/ocr_candidate";

const fixture = new URL("../../../../tests/fixtures/text_and_blank.pdf", import.meta.url);

describe("PDF OCR region crop", () => {
  it("normalizes rotated viewport coordinates and limits pixels", () => {
    expect(planPdfRegionCrop([10, 20, 30, 40], [0, 0, 100, 100], [60.2, 79.8, 20.1, 40.2]))
      .toEqual({ left: 20, top: 40, width: 41, height: 40 });
    expect(() => planPdfRegionCrop([10, 20, 30, 40], [0, 0, 20, 100], [0, 0, 40, 40])).toThrowError();
    expect(() => planPdfRegionCrop([10, 20, 30, 40], [0, 0, 100, 100], [0, 0, 5000, 50]))
      .toThrowError(expect.objectContaining({ code: "RESOURCE_LIMIT" }));
  });

  it("rejects a different PDF before rendering", async () => {
    const bytes = new Uint8Array(await readFile(fixture));
    const v1 = await extractPdf(bytes);
    const block = v1.pages[0].blocks.find(item => item.bbox);
    expect(block).toBeDefined();
    const document = {
      schemaVersion: 2 as const, documentId: v1.documentId, sourceHash: v1.sourceHash, language: null,
      pages: v1.pages.map(page => ({ number: page.number, extractionQuality: "good" as const, rawText: page.rawText,
        ocrText: null, reconstructedText: null, regions: page.number === 1 && block ? [{
          id: block.id, type: "paragraph" as const, bbox: block.bbox, language: null,
          sources: { rawText: block.text, ocrText: null, reconstructedText: null },
          content: { kind: "text" as const, displayText: block.text }, uncertainty: "uncertain" as const,
          qualityStatus: "review_required" as const, confidence: null, flags: [],
        }] : [] })),
    };
    const altered = bytes.slice();
    altered[altered.length - 3] ^= 1;
    await expect(capturePdfOcrRegion(altered, document, 1, block!.id)).rejects.toMatchObject({ code: "SOURCE_MISMATCH" });
    const oversized = new Uint8Array(8_000_001);
    oversized.set(bytes.subarray(0, 5));
    await expect(capturePdfOcrRegion(oversized, document, 1, block!.id)).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    await expect(capturePdfOcrRegion(bytes, document, 2, block!.id)).rejects.toMatchObject({ code: "UNKNOWN_REGION" });
    await expect(capturePdfOcrRegion(bytes, document, 1, block!.id, AbortSignal.abort())).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(capturePdfOcrRegion(bytes, document, 1, PAGE_OCR_TARGET_ID)).rejects.toMatchObject({ code: "UNKNOWN_REGION" });
    await expect(readPdfPageCropPlan(bytes, v1.sourceHash, 2)).resolves.toEqual({ bbox: [0, 0, 595, 842], pixelWidth: 1190, pixelHeight: 1684 });
    await expect(readPdfPageCropPlan(altered, v1.sourceHash, 2)).rejects.toMatchObject({ code: "SOURCE_MISMATCH" });
  });
});

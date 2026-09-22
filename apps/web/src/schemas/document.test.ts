import { describe, expect, it } from "vitest";
import fixture from "../../../../tests/fixtures/document_ir_v1.json";
import { documentIrSchema } from "./document";

describe("DocumentIR v1 contract", () => {
  it("accepts the shared fixture, including unknown text and an OCR page", () => {
    const document = documentIrSchema.parse(fixture);
    expect(document.pages[0].blocks[1].type).toBe("unknown");
    expect(document.pages[0].blocks[1].text).toBe("Trecho incerto");
    expect(document.pages[1].textQuality).toBe("needs_ocr");
  });

  it("rejects duplicate IDs, page gaps and an invalid source ID", () => {
    const duplicate = structuredClone(fixture);
    duplicate.pages[0].blocks[1].id = duplicate.pages[0].blocks[0].id;
    expect(documentIrSchema.safeParse(duplicate).success).toBe(false);

    const gap = structuredClone(fixture);
    gap.pages[1].number = 3;
    expect(documentIrSchema.safeParse(gap).success).toBe(false);

    const wrongId = structuredClone(fixture);
    wrongId.documentId = "doc_ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(documentIrSchema.safeParse(wrongId).success).toBe(false);
  });

  it("rejects invalid confidence, bounding boxes and versions", () => {
    const confidence = structuredClone(fixture);
    confidence.pages[0].blocks[0].confidence = Number.NaN;
    expect(documentIrSchema.safeParse(confidence).success).toBe(false);

    const bbox = structuredClone(fixture);
    bbox.pages[0].blocks[0].bbox = [10, 20, 5, 40];
    expect(documentIrSchema.safeParse(bbox).success).toBe(false);

    const version = structuredClone(fixture);
    version.schemaVersion = 2;
    expect(documentIrSchema.safeParse(version).success).toBe(false);
  });

  it("allows unknown confidence but requires raw text for extracted blocks", () => {
    const unknownConfidence = documentIrSchema.parse(structuredClone(fixture));
    unknownConfidence.pages[0].blocks[0].confidence = null;
    expect(documentIrSchema.safeParse(unknownConfidence).success).toBe(true);

    const missingRawText = structuredClone(fixture);
    missingRawText.pages[0].rawText = "";
    expect(documentIrSchema.safeParse(missingRawText).success).toBe(false);
  });
});

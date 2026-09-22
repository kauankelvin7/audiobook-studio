import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractPdf, PdfImportError } from "./pdf";
import { MAX_PDF_BYTES } from "./pdf_limits";

const fixture = new URL("../../../../tests/fixtures/text_and_blank.pdf", import.meta.url);

describe("local PDF adapter", () => {
  it("extracts real text and retains a page without a text layer", async () => {
    const bytes = new Uint8Array(await readFile(fixture));
    const document = await extractPdf(bytes);
    expect(document.pages).toHaveLength(2);
    expect(document.pages[0].rawText).toContain("Capitulo de teste");
    expect(document.pages[0].blocks.some(block => block.text.includes("Texto local"))).toBe(true);
    expect(document.pages[0].blocks.every(block => block.confidence === null && block.type === "unknown")).toBe(true);
    expect(document.pages[1]).toMatchObject({ number: 2, rawText: "", textQuality: "needs_ocr", blocks: [] });
    expect(document.documentId).toBe(`doc_${document.sourceHash.slice(7)}`);
  });

  it("rejects missing PDF signature and oversized input with typed errors", async () => {
    await expect(extractPdf(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: "INVALID_FILE" });
    const oversized = new Uint8Array(MAX_PDF_BYTES + 1);
    oversized.set([37, 80, 68, 70, 45]);
    await expect(extractPdf(oversized)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("reports corrupt PDFs without leaking parser internals", async () => {
    const malformed = new TextEncoder().encode("%PDF-1.7\ninvalid");
    await expect(extractPdf(malformed)).rejects.toBeInstanceOf(PdfImportError);
    await expect(extractPdf(malformed)).rejects.toMatchObject({ code: "PARSER_ERROR" });
  });
});

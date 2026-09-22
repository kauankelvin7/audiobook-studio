import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { documentIrSchema, type DocumentIr } from "../schemas/document";
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from "./pdf_limits";

export type PdfImportErrorCode = "INVALID_FILE" | "FILE_TOO_LARGE" | "PAGE_LIMIT" | "PASSWORD_REQUIRED" | "PARSER_ERROR";

export class PdfImportError extends Error {
  constructor(public readonly code: PdfImportErrorCode, message: string) {
    super(message);
    this.name = "PdfImportError";
  }
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70 && bytes[4] === 45;
}

function isTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item && typeof item.str === "string" && "transform" in item;
}

function errorFromParser(error: unknown): PdfImportError {
  if (error instanceof PdfImportError) return error;
  if (error instanceof Error && error.name === "PasswordException") {
    return new PdfImportError("PASSWORD_REQUIRED", "Este PDF exige senha. Use uma cópia sem proteção para importar.");
  }
  return new PdfImportError("PARSER_ERROR", "Não foi possível ler este PDF. Confira se o arquivo está íntegro.");
}

export async function extractPdf(bytes: Uint8Array): Promise<DocumentIr> {
  if (!hasPdfSignature(bytes)) {
    throw new PdfImportError("INVALID_FILE", "O arquivo não parece ser um PDF válido.");
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new PdfImportError("FILE_TOO_LARGE", "O PDF ultrapassa o limite de 32 MB.");
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const loadingTask = getDocument({ data: bytes.slice(), stopAtErrors: true });
  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages < 1 || pdf.numPages > MAX_PDF_PAGES) {
      throw new PdfImportError("PAGE_LIMIT", `O PDF deve ter entre 1 e ${MAX_PDF_PAGES} páginas.`);
    }

    const pages: DocumentIr["pages"] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter(isTextItem);
      const rawText = items.map(item => item.str + (item.hasEOL ? "\n" : " ")).join("").trim();
      const blocks: DocumentIr["pages"][number]["blocks"] = [];
      for (const [index, item] of items.entries()) {
        if (!item.str.trim()) continue;
        const [x, y] = [item.transform[4], item.transform[5]];
        const width = Math.abs(item.width);
        const height = Math.abs(item.height);
        const bbox = [x, y, x + width, y + height] as [number, number, number, number];
        blocks.push({
          id: `p${pageNumber}-t${index + 1}`,
          type: "unknown",
          language: null,
          text: item.str,
          confidence: null,
          bbox: bbox.every(Number.isFinite) ? bbox : null,
          flags: ["layout_unclassified"],
        });
      }
      pages.push({ number: pageNumber, rawText, textQuality: blocks.length ? "extracted" : "needs_ocr", blocks });
      page.cleanup();
    }

    return documentIrSchema.parse({ schemaVersion: 1, documentId: `doc_${hex}`, sourceHash: `sha256:${hex}`, language: null, pages });
  } catch (error) {
    throw errorFromParser(error);
  } finally {
    await loadingTask.destroy();
  }
}

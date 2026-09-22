import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { documentIrSchema, type DocumentIr } from "../schemas/document";
import { MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_TEXT_CHARS_PER_PAGE, MAX_TEXT_ITEMS_PER_PAGE, MAX_TOTAL_TEXT_CHARS } from "./pdf_limits";
import { assembleTextPage, markRepeatedMargins, type PageBounds } from "./pdf_layout";

export type PdfImportErrorCode = "INVALID_FILE" | "FILE_TOO_LARGE" | "PAGE_LIMIT" | "CONTENT_LIMIT" | "CANCELLED" | "PASSWORD_REQUIRED" | "PARSER_ERROR";

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

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PdfImportError("CANCELLED", "A importação foi cancelada.");
}

export function assertPdfTextLimits(itemCount: number, pageTextChars: number, totalTextChars: number): void {
  if (itemCount > MAX_TEXT_ITEMS_PER_PAGE || pageTextChars > MAX_TEXT_CHARS_PER_PAGE || totalTextChars > MAX_TOTAL_TEXT_CHARS) {
    throw new PdfImportError("CONTENT_LIMIT", "O PDF contém texto demais para uma importação segura no navegador.");
  }
}

export async function extractPdf(bytes: Uint8Array, signal?: AbortSignal): Promise<DocumentIr> {
  throwIfCancelled(signal);
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
    throwIfCancelled(signal);
    if (pdf.numPages < 1 || pdf.numPages > MAX_PDF_PAGES) {
      throw new PdfImportError("PAGE_LIMIT", `O PDF deve ter entre 1 e ${MAX_PDF_PAGES} páginas.`);
    }

    const pages: DocumentIr["pages"] = [];
    const bounds: PageBounds[] = [];
    let totalTextChars = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      throwIfCancelled(signal);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      throwIfCancelled(signal);
      const items = content.items.filter(isTextItem);
      const pageTextChars = items.reduce((total, item) => total + item.str.length, 0);
      totalTextChars += pageTextChars;
      try {
        assertPdfTextLimits(items.length, pageTextChars, totalTextChars);
      } catch (error) {
        page.cleanup();
        throw error;
      }
      pages.push(assembleTextPage(items, pageNumber));
      bounds.push({ minY: page.view[1], maxY: page.view[3], rotation: page.rotate });
      page.cleanup();
    }

    return documentIrSchema.parse({ schemaVersion: 1, documentId: `doc_${hex}`, sourceHash: `sha256:${hex}`, language: null, pages: markRepeatedMargins(pages, bounds) });
  } catch (error) {
    throw errorFromParser(error);
  } finally {
    await loadingTask.destroy();
  }
}

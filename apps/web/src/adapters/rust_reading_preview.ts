import { z } from "zod";
import { build_reading_preview_json, build_reading_session_json } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { documentIrV2Schema, type DocumentIrV2 } from "../schemas/ingestion";
import { ensureRustWasm } from "./rust_wasm_runtime";

const readingPreviewSchema = z.object({
  documentId: z.string(),
  sourceHash: z.string(),
  pageNumber: z.number().int().positive(),
  chunks: z.array(z.object({ regionId: z.string().min(1), text: z.string().min(1) }).strict()).min(1),
}).strict();

export type ReadingPreview = z.infer<typeof readingPreviewSchema>;
const readingSessionSchema = z.object({
  documentId: z.string(),
  sourceHash: z.string(),
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
  pages: z.array(readingPreviewSchema).min(1).max(10),
}).strict();
export type ReadingSession = z.infer<typeof readingSessionSchema>;

export class ReadingPreviewError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "WASM_INIT_FAILED" | "CORE_REJECTED" | "INVALID_CORE_OUTPUT", message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReadingPreviewError";
  }
}

export async function buildReadingPreview(document: DocumentIrV2, pageNumber: number): Promise<ReadingPreview> {
  const parsed = documentIrV2Schema.safeParse(document);
  if (!parsed.success || !Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new ReadingPreviewError("INVALID_INPUT", "Documento ou página inválida.");
  }
  try {
    await ensureRustWasm();
  } catch (error) {
    throw new ReadingPreviewError("WASM_INIT_FAILED", "Não foi possível carregar a validação local.", { cause: error });
  }
  let raw: string;
  try {
    raw = build_reading_preview_json(JSON.stringify(parsed.data), pageNumber);
  } catch (error) {
    throw new ReadingPreviewError("CORE_REJECTED", "Esta página precisa de revisão ou recuperação antes da leitura.", { cause: error });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    throw new ReadingPreviewError("INVALID_CORE_OUTPUT", "A resposta de leitura não é JSON válido.", { cause: error });
  }
  const preview = readingPreviewSchema.safeParse(decoded);
  if (!preview.success || preview.data.documentId !== parsed.data.documentId
    || preview.data.sourceHash !== parsed.data.sourceHash || preview.data.pageNumber !== pageNumber) {
    throw new ReadingPreviewError("INVALID_CORE_OUTPUT", "A leitura não corresponde ao documento atual.");
  }
  return preview.data;
}

export async function buildReadingSession(document: DocumentIrV2, startPage: number, endPage: number): Promise<ReadingSession> {
  const parsed = documentIrV2Schema.safeParse(document);
  if (!parsed.success || !Number.isInteger(startPage) || !Number.isInteger(endPage)
    || startPage < 1 || endPage < startPage || endPage - startPage >= 10) {
    throw new ReadingPreviewError("INVALID_INPUT", "Selecione de uma a dez páginas em ordem.");
  }
  try {
    await ensureRustWasm();
  } catch (error) {
    throw new ReadingPreviewError("WASM_INIT_FAILED", "Não foi possível carregar a validação local.", { cause: error });
  }
  let raw: string;
  try {
    raw = build_reading_session_json(JSON.stringify(parsed.data), startPage, endPage);
  } catch (error) {
    throw new ReadingPreviewError("CORE_REJECTED", "O intervalo contém página que precisa de revisão ou recuperação.", { cause: error });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    throw new ReadingPreviewError("INVALID_CORE_OUTPUT", "A resposta de leitura não é JSON válido.", { cause: error });
  }
  const session = readingSessionSchema.safeParse(decoded);
  if (!session.success || session.data.documentId !== parsed.data.documentId
    || session.data.sourceHash !== parsed.data.sourceHash || session.data.startPage !== startPage
    || session.data.endPage !== endPage || session.data.pages.length !== endPage - startPage + 1
    || session.data.pages.some((page, index) => page.documentId !== parsed.data.documentId
      || page.sourceHash !== parsed.data.sourceHash || page.pageNumber !== startPage + index)) {
    throw new ReadingPreviewError("INVALID_CORE_OUTPUT", "A leitura não corresponde ao intervalo do documento atual.");
  }
  return session.data;
}

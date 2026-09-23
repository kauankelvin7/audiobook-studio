import { build_ocr_candidate_receipt_json } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { documentIrV2Schema, type DocumentIrV2 } from "../schemas/ingestion";
import { ocrCandidateReceiptSchema, ocrCandidateSchema, type OcrCandidate, type OcrCandidateReceipt } from "../schemas/ocr_candidate";
import { ensureRustWasm } from "./rust_wasm_runtime";

export type RustOcrCandidateErrorCode = "INVALID_INPUT" | "WASM_INIT_FAILED" | "CORE_REJECTED" | "INVALID_CORE_OUTPUT";

export class RustOcrCandidateError extends Error {
  constructor(public readonly code: RustOcrCandidateErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RustOcrCandidateError";
  }
}

export async function buildOcrCandidateReceipt(document: DocumentIrV2, candidate: OcrCandidate): Promise<OcrCandidateReceipt> {
  const parsedDocument = documentIrV2Schema.safeParse(document);
  const parsedCandidate = ocrCandidateSchema.safeParse(candidate);
  if (!parsedDocument.success || !parsedCandidate.success) {
    throw new RustOcrCandidateError("INVALID_INPUT", "O documento ou candidato OCR não passou na validação.");
  }
  try {
    await ensureRustWasm();
  } catch (error) {
    throw new RustOcrCandidateError("WASM_INIT_FAILED", "Não foi possível carregar o núcleo Rust/WASM.", { cause: error });
  }
  let receiptJson: string;
  try {
    receiptJson = build_ocr_candidate_receipt_json(JSON.stringify(parsedDocument.data), JSON.stringify(parsedCandidate.data));
  } catch (error) {
    throw new RustOcrCandidateError("CORE_REJECTED", "O núcleo Rust rejeitou o candidato OCR.", { cause: error });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(receiptJson);
  } catch (error) {
    throw new RustOcrCandidateError("INVALID_CORE_OUTPUT", "O recibo OCR não é JSON válido.", { cause: error });
  }
  const parsedReceipt = ocrCandidateReceiptSchema.safeParse(decoded);
  if (!parsedReceipt.success) {
    throw new RustOcrCandidateError("INVALID_CORE_OUTPUT", "O recibo OCR não passou na validação.", { cause: parsedReceipt.error });
  }
  const receipt = parsedReceipt.data;
  let textDigest: ArrayBuffer;
  try {
    textDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parsedCandidate.data.text));
  } catch (error) {
    throw new RustOcrCandidateError("INVALID_CORE_OUTPUT", "Não foi possível conferir o texto do recibo OCR.", { cause: error });
  }
  const ocrTextHash = `sha256:${Array.from(new Uint8Array(textDigest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  if (receipt.documentId !== parsedDocument.data.documentId || receipt.sourceHash !== parsedDocument.data.sourceHash
    || receipt.pageNumber !== parsedCandidate.data.pageNumber || receipt.regionId !== parsedCandidate.data.regionId
    || receipt.nativeTextHash !== parsedCandidate.data.nativeTextHash || receipt.imageHash !== parsedCandidate.data.imageHash
    || receipt.engineId !== parsedCandidate.data.engineId || receipt.engineVersion !== parsedCandidate.data.engineVersion
    || receipt.ocrTextHash !== ocrTextHash) {
    throw new RustOcrCandidateError("INVALID_CORE_OUTPUT", "O recibo OCR não corresponde ao documento e à região informados.");
  }
  return receipt;
}

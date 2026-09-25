import { build_ocr_correction_training_record_json, compile_ocr_correction_model_json, suggest_ocr_corrections_json, suggest_ocr_corrections_with_model_json } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { documentIrV2Schema, type DocumentIrV2 } from "../schemas/ingestion";
import { ocrCandidateSchema, ocrReviewSubmissionSchema, type OcrCandidate, type OcrReviewSubmission } from "../schemas/ocr_candidate";
import { ocrCorrectionModelSchema, ocrCorrectionSuggestionReportSchema, ocrCorrectionTrainingRecordSchema,
  type OcrCorrectionModel, type OcrCorrectionSuggestionReport, type OcrCorrectionTrainingRecord } from "../schemas/ocr_learning";
import { ensureRustWasm } from "./rust_wasm_runtime";

export class RustOcrLearningError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "WASM_INIT_FAILED" | "CORE_REJECTED" | "INVALID_CORE_OUTPUT", message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RustOcrLearningError";
  }
}

function inputs(document: DocumentIrV2, candidate: OcrCandidate, submission?: OcrReviewSubmission) {
  const parsedDocument = documentIrV2Schema.safeParse(document);
  const parsedCandidate = ocrCandidateSchema.safeParse(candidate);
  const parsedSubmission = submission === undefined ? undefined : ocrReviewSubmissionSchema.safeParse(submission);
  if (!parsedDocument.success || !parsedCandidate.success || (parsedSubmission && !parsedSubmission.success)) {
    throw new RustOcrLearningError("INVALID_INPUT", "A entrada de memória OCR não passou na validação.");
  }
  const values = { document: parsedDocument.data, candidate: parsedCandidate.data,
    submission: parsedSubmission?.data };
  if (new TextEncoder().encode(JSON.stringify(values)).length > 40_000_000) {
    throw new RustOcrLearningError("INVALID_INPUT", "A entrada de memória OCR excede o limite seguro.");
  }
  return values;
}

export async function buildOcrCorrectionTrainingRecord(document: DocumentIrV2, candidate: OcrCandidate,
  submission: OcrReviewSubmission): Promise<OcrCorrectionTrainingRecord> {
  const parsed = inputs(document, candidate, submission);
  try { await ensureRustWasm(); }
  catch (error) { throw new RustOcrLearningError("WASM_INIT_FAILED", "Não foi possível carregar o núcleo Rust/WASM.", { cause: error }); }
  let output: unknown;
  try {
    output = JSON.parse(build_ocr_correction_training_record_json(JSON.stringify(parsed.document),
      JSON.stringify(parsed.candidate), JSON.stringify(parsed.submission)));
  } catch (error) {
    throw new RustOcrLearningError("CORE_REJECTED", "O núcleo Rust recusou aprender com esta revisão OCR.", { cause: error });
  }
  const record = ocrCorrectionTrainingRecordSchema.safeParse(output);
  if (!record.success) throw new RustOcrLearningError("INVALID_CORE_OUTPUT", "O registro de memória OCR retornado é inválido.", { cause: record.error });
  return record.data;
}

export async function suggestOcrCorrections(document: DocumentIrV2, candidate: OcrCandidate,
  records: OcrCorrectionTrainingRecord[]): Promise<OcrCorrectionSuggestionReport> {
  const parsed = inputs(document, candidate);
  const parsedRecords = records.map(item => ocrCorrectionTrainingRecordSchema.parse(item));
  if (parsedRecords.length > 1_024 || new TextEncoder().encode(JSON.stringify(parsedRecords)).length > 8_000_000) {
    throw new RustOcrLearningError("INVALID_INPUT", "A memória OCR excede o limite seguro.");
  }
  try { await ensureRustWasm(); }
  catch (error) { throw new RustOcrLearningError("WASM_INIT_FAILED", "Não foi possível carregar o núcleo Rust/WASM.", { cause: error }); }
  let output: unknown;
  try {
    output = JSON.parse(suggest_ocr_corrections_json(JSON.stringify(parsed.document), JSON.stringify(parsed.candidate), JSON.stringify(parsedRecords)));
  } catch (error) {
    throw new RustOcrLearningError("CORE_REJECTED", "O núcleo Rust recusou calcular sugestões OCR.", { cause: error });
  }
  const report = ocrCorrectionSuggestionReportSchema.safeParse(output);
  if (!report.success) throw new RustOcrLearningError("INVALID_CORE_OUTPUT", "A sugestão OCR retornada é inválida.", { cause: report.error });
  if (report.data.candidateTextHash !== `sha256:${await digest(candidate.text)}`) {
    throw new RustOcrLearningError("INVALID_CORE_OUTPUT", "A sugestão OCR não confere com o texto candidato.");
  }
  return report.data;
}

export async function compileOcrCorrectionModel(records: OcrCorrectionTrainingRecord[]): Promise<OcrCorrectionModel> {
  const parsedRecords = records.map(item => ocrCorrectionTrainingRecordSchema.parse(item));
  if (parsedRecords.length > 1_024 || new TextEncoder().encode(JSON.stringify(parsedRecords)).length > 8_000_000) {
    throw new RustOcrLearningError("INVALID_INPUT", "A memória OCR excede o limite seguro.");
  }
  try { await ensureRustWasm(); }
  catch (error) { throw new RustOcrLearningError("WASM_INIT_FAILED", "Não foi possível carregar o núcleo Rust/WASM.", { cause: error }); }
  try {
    const model = ocrCorrectionModelSchema.safeParse(JSON.parse(compile_ocr_correction_model_json(JSON.stringify(parsedRecords))));
    if (!model.success) throw new RustOcrLearningError("INVALID_CORE_OUTPUT", "O modelo OCR retornado é inválido.", { cause: model.error });
    return model.data;
  } catch (error) {
    if (error instanceof RustOcrLearningError) throw error;
    throw new RustOcrLearningError("CORE_REJECTED", "O núcleo Rust recusou treinar a memória OCR.", { cause: error });
  }
}

export async function suggestOcrCorrectionsWithModel(document: DocumentIrV2, candidate: OcrCandidate,
  model: OcrCorrectionModel): Promise<OcrCorrectionSuggestionReport> {
  const parsed = inputs(document, candidate);
  const parsedModel = ocrCorrectionModelSchema.parse(model);
  try { await ensureRustWasm(); }
  catch (error) { throw new RustOcrLearningError("WASM_INIT_FAILED", "Não foi possível carregar o núcleo Rust/WASM.", { cause: error }); }
  let output: unknown;
  try { output = JSON.parse(suggest_ocr_corrections_with_model_json(JSON.stringify(parsed.document), JSON.stringify(parsed.candidate), JSON.stringify(parsedModel))); }
  catch (error) { throw new RustOcrLearningError("CORE_REJECTED", "O núcleo Rust recusou aplicar o modelo OCR.", { cause: error }); }
  const report = ocrCorrectionSuggestionReportSchema.safeParse(output);
  if (!report.success || report.data.candidateTextHash !== `sha256:${await digest(candidate.text)}`) {
    throw new RustOcrLearningError("INVALID_CORE_OUTPUT", "A sugestão OCR do modelo é inválida.", { cause: report.success ? undefined : report.error });
  }
  return report.data;
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

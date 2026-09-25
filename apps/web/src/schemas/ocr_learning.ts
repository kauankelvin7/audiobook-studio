import { z } from "zod";
import { ocrCandidateReceiptSchema, ocrCandidateSchema, ocrReviewSubmissionSchema } from "./ocr_candidate";
import { documentIrV2Schema } from "./ingestion";

const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const token = z.string().regex(/^[A-Z0-9-]{1,128}$/);

export const ocrCorrectionRuleSchema = z.object({
  observedToken: token,
  correctedToken: token,
}).strict().superRefine((value, context) => {
  if (value.observedToken.length < 2 || value.observedToken.length !== value.correctedToken.length
    || value.observedToken === value.correctedToken || (!/\d/.test(value.observedToken) && !/\d/.test(value.correctedToken))) {
    context.addIssue({ code: "custom", message: "A regra OCR deve trocar um token técnico de mesmo tamanho." });
    return;
  }
  const permitted = new Set(["0O", "O0", "1I", "I1", "1L", "L1", "5S", "S5", "8B", "B8"]);
  const differences = Array.from(value.observedToken).map((character, index) => `${character}${value.correctedToken[index]}`)
    .filter(pair => pair[0] !== pair[1]);
  if (differences.length === 0 || differences.length > 4 || differences.some(pair => !permitted.has(pair))) {
    context.addIssue({ code: "custom", message: "A regra OCR contém uma troca que o núcleo não permite." });
  }
});

export const ocrCorrectionTrainingRecordSchema = z.object({
  schemaVersion: z.literal(1),
  sourceHash: hash,
  candidateReceiptHash: hash,
  reviewHash: hash,
  rules: z.array(ocrCorrectionRuleSchema).min(1).max(64),
  recordHash: hash,
  methodVersion: z.literal("ocr-ambiguity-memory-rust-v1"),
}).strict();

export const ocrCorrectionSuggestionSchema = z.object({
  observedToken: token,
  suggestedToken: token,
  evidenceCount: z.number().int().min(3),
}).strict();

export const ocrCorrectionSuggestionReportSchema = z.object({
  schemaVersion: z.literal(1),
  candidateReceiptHash: hash,
  candidateTextHash: hash,
  trainingRecordCount: z.number().int().min(0).max(1_024),
  acceptedRuleCount: z.number().int().min(0),
  suggestions: z.array(ocrCorrectionSuggestionSchema),
  suggestedText: z.string(),
  status: z.literal("review_required"),
  methodVersion: z.literal("ocr-ambiguity-suggestion-rust-v1"),
}).strict();

export const ocrCorrectionModelSchema = z.object({
  schemaVersion: z.literal(1),
  trainingRecordCount: z.number().int().min(0).max(1_024),
  trainingRecordHashes: z.array(hash).max(1_024),
  rules: z.array(ocrCorrectionSuggestionSchema).max(1_024),
  modelHash: hash,
  methodVersion: z.literal("ocr-ambiguity-model-rust-v1"),
}).strict().superRefine((value, context) => {
  if (value.trainingRecordCount !== value.trainingRecordHashes.length
    || new Set(value.trainingRecordHashes).size !== value.trainingRecordHashes.length) {
    context.addIssue({ code: "custom", message: "O modelo OCR não contém uma lista válida de evidências." });
  }
});

export const ocrLearningRequestSchema = z.object({
  document: documentIrV2Schema,
  candidate: ocrCandidateSchema,
  submission: ocrReviewSubmissionSchema,
  candidateReceipt: ocrCandidateReceiptSchema,
}).strict();

export type OcrCorrectionTrainingRecord = z.infer<typeof ocrCorrectionTrainingRecordSchema>;
export type OcrCorrectionSuggestionReport = z.infer<typeof ocrCorrectionSuggestionReportSchema>;
export type OcrCorrectionModel = z.infer<typeof ocrCorrectionModelSchema>;

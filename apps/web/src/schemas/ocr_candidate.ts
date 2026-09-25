import { z } from "zod";

// Boundary mirror of audiobook_core::ocr::PAGE_OCR_TARGET_ID.
export const PAGE_OCR_TARGET_ID = "__page__";

const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const identity = z.string().min(1).refine(value => value.trim().length > 0
  && new TextEncoder().encode(value).length <= 128 && !/\p{Cc}/u.test(value));

export const ocrCandidateSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.string().regex(/^doc_[0-9a-f]{64}$/),
  sourceHash: hash,
  pageNumber: z.number().int().positive(),
  regionId: z.string().min(1).refine(value => value.trim().length > 0),
  nativeTextHash: hash,
  imageHash: hash,
  engineId: identity,
  engineVersion: identity,
  text: z.string().min(1).refine(value => value.trim().length > 0 && new TextEncoder().encode(value).length <= 1_000_000),
}).strict();

export const ocrCandidateReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.string().regex(/^doc_[0-9a-f]{64}$/),
  sourceHash: hash,
  documentHash: hash,
  pageNumber: z.number().int().positive(),
  regionId: z.string().min(1),
  nativeTextHash: hash,
  imageHash: hash,
  engineId: identity,
  engineVersion: identity,
  ocrTextHash: hash,
  nativePrivateUseCount: z.number().int().nonnegative(),
  ocrPrivateUseCount: z.number().int().nonnegative(),
  status: z.literal("pending"),
  receiptHash: hash,
  methodVersion: z.literal("ocr-candidate-rust-v1"),
}).strict();

export const ocrComparisonReportSchema = z.object({
  schemaVersion: z.literal(1),
  receiptHash: hash,
  nativeTextHash: hash,
  ocrTextHash: hash,
  nativePrivateUseCount: z.number().int().nonnegative(),
  ocrPrivateUseCount: z.number().int().nonnegative(),
  differingTokenLowerBound: z.number().int().nonnegative(),
  differences: z.array(z.object({
    token: z.string().min(1).max(128).regex(/^[A-Z0-9-]+$/),
    nativeCount: z.number().int().nonnegative(),
    ocrCount: z.number().int().nonnegative(),
    containsDigit: z.boolean(),
  }).strict()).max(256),
  truncated: z.boolean(),
  status: z.literal("review_required"),
  methodVersion: z.literal("ocr-token-comparison-rust-v1"),
}).strict().refine(value => value.differingTokenLowerBound >= value.differences.length);

export type OcrCandidate = z.infer<typeof ocrCandidateSchema>;
export type OcrCandidateReceipt = z.infer<typeof ocrCandidateReceiptSchema>;
export type OcrComparisonReport = z.infer<typeof ocrComparisonReportSchema>;

const reviewDisposition = z.enum(["keep_native", "retain_candidate_for_review", "propose_correction"]);
const proposedText = z.string().refine(value => value.trim().length > 0 && new TextEncoder().encode(value).length <= 1_000_000);
export const ocrReviewSubmissionSchema = z.object({
  schemaVersion: z.literal(1),
  receiptHash: hash,
  disposition: reviewDisposition,
  rationale: z.string().refine(value => value.trim().length > 0 && new TextEncoder().encode(value).length <= 2_000),
  proposedText: proposedText.nullable(),
}).strict().superRefine((value, context) => {
  if ((value.disposition === "propose_correction") !== (value.proposedText !== null)) {
    context.addIssue({ code: "custom", message: "A proposta textual deve corresponder à decisão." });
  }
});

export const ocrReviewReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.string().regex(/^doc_[0-9a-f]{64}$/),
  sourceHash: hash,
  pageNumber: z.number().int().positive(),
  regionId: z.string().min(1),
  candidateReceiptHash: hash,
  comparisonHash: hash,
  disposition: reviewDisposition,
  rationale: z.string().min(1),
  proposedText: z.string().nullable(),
  status: z.literal("unverified"),
  reviewHash: hash,
  methodVersion: z.literal("ocr-review-rust-v1"),
}).strict();

export type OcrReviewSubmission = z.infer<typeof ocrReviewSubmissionSchema>;
export type OcrReviewReceipt = z.infer<typeof ocrReviewReceiptSchema>;

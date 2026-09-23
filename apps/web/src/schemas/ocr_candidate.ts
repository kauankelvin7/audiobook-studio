import { z } from "zod";

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

export type OcrCandidate = z.infer<typeof ocrCandidateSchema>;
export type OcrCandidateReceipt = z.infer<typeof ocrCandidateReceiptSchema>;

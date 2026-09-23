import { z } from "zod";
import { narrationEligibilitySchema } from "./content_model";
import { qualityStatusSchema, uncertaintySchema } from "./ingestion";

const id = z.string().trim().min(1);
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);

const reviewSourceSchema = z.object({
  sourceRef: id,
  sourceUnitId: id,
  analysisText: z.string().trim().min(1).nullable(),
  qualityStatus: qualityStatusSchema,
  uncertainty: uncertaintySchema,
  narrationEligibility: narrationEligibilitySchema,
  flags: z.array(id),
}).strict();

export const scriptReviewPacketSchema = z.object({
  schemaVersion: z.literal(1),
  planId: id,
  documentId: id,
  sourceHash: hash,
  contentHash: hash,
  planHash: hash,
  scriptHash: hash,
  segments: z.array(z.object({
    sectionId: id,
    segmentId: id,
    displayText: z.string().min(1),
    speechText: z.string().min(1),
    sourceRefs: z.array(id).min(1),
    sources: z.array(reviewSourceSchema).min(1),
    reviewStatus: z.literal("pending"),
  }).strict()).min(1),
  methodVersion: id,
}).strict();

export type ScriptReviewPacket = z.infer<typeof scriptReviewPacketSchema>;

export const scriptReviewSubmissionSchema = z.object({
  schemaVersion: z.literal(1),
  planId: id,
  documentId: id,
  sourceHash: hash,
  contentHash: hash,
  planHash: hash,
  scriptHash: hash,
  decisions: z.array(z.object({
    segmentId: id,
    verdict: z.enum(["supported", "unsupported", "needs_evidence"]),
    evidenceSourceUnitIds: z.array(id),
    rationale: z.string().trim().min(1),
  }).strict()).min(1),
}).strict();

export const scriptReviewReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  planId: id,
  documentId: id,
  sourceHash: hash,
  contentHash: hash,
  planHash: hash,
  scriptHash: hash,
  submissionHash: hash,
  reviewedSegments: z.number().int().positive(),
  attestationStatus: z.literal("unverified"),
  methodVersion: id,
}).strict();

export type ScriptReviewSubmission = z.infer<typeof scriptReviewSubmissionSchema>;
export type ScriptReviewReceipt = z.infer<typeof scriptReviewReceiptSchema>;

import { z } from "zod";
import { build_narrative_draft_json, build_permitted_content_model_json, build_semantic_outline_json,
  promote_approved_ocr_json } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { contentModelSchema, semanticOutlineSchema } from "../schemas/content_model";
import { narrationQaSchema, narrativePlanSchema, narrativeScriptSchema } from "../schemas/narrative";
import { documentIrV2Schema, type DocumentIrV2 } from "../schemas/ingestion";
import { sourceHashSchema } from "../schemas/persistence";
import type { LocalProjectPersistence } from "./local_project_persistence";
import { OcrReviewPersistence, type SavedOcrReview } from "./ocr_review_persistence";
import { ensureRustWasm } from "./rust_wasm_runtime";

const approvalSchema = z.object({ schemaVersion: z.literal(1), documentHash: sourceHashSchema,
  reviewHash: sourceHashSchema, approvedTextHash: sourceHashSchema,
  revision: z.number().int().positive(), attestation: z.literal("local_operator_confirmed") }).strict();
const promotionSchema = z.object({ schemaVersion: z.literal(1), sourceDocumentHash: sourceHashSchema,
  canonicalDocumentHash: sourceHashSchema, reviewHash: sourceHashSchema,
  approvedTextHash: sourceHashSchema, revision: z.number().int().positive(),
  attestation: z.literal("local_operator_confirmed"), pageNumber: z.number().int().positive(),
  regionId: z.string().min(1), document: documentIrV2Schema }).strict();
export const canonicalDraftSchema = z.object({ schemaVersion: z.literal(1),
  contentModel: contentModelSchema, semanticOutline: semanticOutlineSchema,
  plan: narrativePlanSchema, script: narrativeScriptSchema, qa: narrationQaSchema }).strict();
const envelopeSchema = z.object({ schemaVersion: z.literal(1), reviewArtifactKey: z.string().min(1),
  approval: approvalSchema, promotion: promotionSchema, contentModel: contentModelSchema,
  semanticOutline: semanticOutlineSchema, draft: canonicalDraftSchema }).strict();
export type CanonicalOcr = z.infer<typeof envelopeSchema>;

async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function saveApprovedOcr(persistence: LocalProjectPersistence, source: DocumentIrV2,
  review: SavedOcrReview): Promise<CanonicalOcr> {
  if (review.submission.disposition !== "propose_correction" || !review.submission.proposedText?.trim()) {
    throw new Error("Registre o texto corrigido antes de aprová-lo.");
  }
  await ensureRustWasm();
  const latest = await persistence.loadLatest(source.documentId);
  const activeDocument = await persistence.loadArtifactRecord(source.documentId, "document_ir_v2");
  if (!latest || !activeDocument || !latest.artifactKeys.includes(review.artifact.artifactKey)
    || !latest.artifactKeys.includes("document_ir_v2")) throw new Error("A revisão não pertence ao projeto ativo.");
  const documentHash = await hashText(JSON.stringify(source));
  if (activeDocument.contentHash !== documentHash) throw new Error("O documento ativo mudou após a revisão.");
  const approval = approvalSchema.parse({ schemaVersion: 1, documentHash: review.evidence.receipt.documentHash,
    reviewHash: review.receipt.reviewHash, approvedTextHash: await hashText(review.submission.proposedText),
    revision: 1, attestation: "local_operator_confirmed" });
  const promotion = promotionSchema.parse(JSON.parse(promote_approved_ocr_json(JSON.stringify(source),
    JSON.stringify(review.evidence.candidate), JSON.stringify(review.submission), JSON.stringify(approval))));
  if (promotion.sourceDocumentHash !== approval.documentHash || promotion.reviewHash !== review.receipt.reviewHash
    || promotion.approvedTextHash !== approval.approvedTextHash) throw new Error("A promoção OCR divergiu da revisão aprovada.");
  const contentModel = contentModelSchema.parse(JSON.parse(build_permitted_content_model_json(JSON.stringify(promotion.document))));
  const semanticOutline = semanticOutlineSchema.parse(JSON.parse(build_semantic_outline_json(JSON.stringify(contentModel))));
  const draft = canonicalDraftSchema.parse(JSON.parse(build_narrative_draft_json(JSON.stringify(promotion.document))));
  if (JSON.stringify(draft.contentModel) !== JSON.stringify(contentModel)
    || JSON.stringify(draft.semanticOutline) !== JSON.stringify(semanticOutline)) throw new Error("O roteiro preliminar diverge do texto aprovado.");
  const envelope = envelopeSchema.parse({ schemaVersion: 1, reviewArtifactKey: review.artifact.artifactKey,
    approval, promotion, contentModel, semanticOutline, draft });
  const artifactKey = `canonical_ocr_${review.receipt.reviewHash.slice(7)}`;
  const existing = await persistence.loadArtifactRecord(source.documentId, artifactKey);
  if (existing) {
    const stored = envelopeSchema.parse(JSON.parse(await (await persistence.readArtifact(existing)).text()));
    if (JSON.stringify(stored) !== JSON.stringify(envelope)) throw new Error("A aprovação salva diverge da revisão atual.");
    return stored;
  }
  const createdAtMs = Date.now();
  await persistence.persistNext({ schemaVersion: 1, projectId: latest.projectId, createdAtMs,
    pipelineVersion: latest.pipelineVersion, sourceHash: latest.sourceHash, job: latest.job,
    artifactKeys: [...new Set([...latest.artifactKeys, artifactKey])],
  }, [{ projectId: latest.projectId, artifactKey, kind: "model", mediaType: "application/json",
    value: new Blob([JSON.stringify(envelope)], { type: "application/json" }), createdAtMs,
    regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null }], latest.checksum);
  return envelope;
}

export async function loadLatestApprovedOcr(persistence: LocalProjectPersistence,
  source: DocumentIrV2): Promise<CanonicalOcr | null> {
  const latest = await persistence.loadLatest(source.documentId);
  if (!latest || latest.sourceHash !== source.sourceHash) return null;
  const key = [...latest.artifactKeys].reverse().find(value => /^canonical_ocr_[0-9a-f]{64}$/.test(value));
  if (!key) return null;
  const record = await persistence.loadArtifactRecord(source.documentId, key);
  if (!record || record.kind !== "model" || record.mediaType !== "application/json" || record.sizeBytes > 32_000_000)
    throw new Error("A aprovação canônica salva está indisponível.");
  const stored = envelopeSchema.parse(JSON.parse(await (await persistence.readArtifact(record)).text()));
  const reviewRecord = await persistence.loadArtifactRecord(source.documentId, stored.reviewArtifactKey);
  if (!reviewRecord || !latest.artifactKeys.includes(reviewRecord.artifactKey))
    throw new Error("A revisão de origem da aprovação não está disponível.");
  const review = await new OcrReviewPersistence(persistence).openHistorical(source.documentId, source, reviewRecord);
  await ensureRustWasm();
  const fresh = promotionSchema.parse(JSON.parse(promote_approved_ocr_json(JSON.stringify(source),
    JSON.stringify(review.evidence.candidate), JSON.stringify(review.submission), JSON.stringify(stored.approval))));
  if (JSON.stringify(fresh) !== JSON.stringify(stored.promotion)) throw new Error("A promoção salva não confere com o documento atual.");
  const contentModel = contentModelSchema.parse(JSON.parse(build_permitted_content_model_json(JSON.stringify(fresh.document))));
  const semanticOutline = semanticOutlineSchema.parse(JSON.parse(build_semantic_outline_json(JSON.stringify(contentModel))));
  const draft = canonicalDraftSchema.parse(JSON.parse(build_narrative_draft_json(JSON.stringify(fresh.document))));
  if (JSON.stringify(contentModel) !== JSON.stringify(stored.contentModel)
    || JSON.stringify(semanticOutline) !== JSON.stringify(stored.semanticOutline)
    || JSON.stringify(draft) !== JSON.stringify(stored.draft))
    throw new Error("A análise salva não confere com o texto aprovado.");
  return stored;
}

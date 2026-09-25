import { z } from "zod";
import { approve_native_document_json, build_narrative_draft_json, document_v2_hash_json } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { documentIrV2Schema, type DocumentIrV2 } from "../schemas/ingestion";
import { sourceHashSchema } from "../schemas/persistence";
import { canonicalDraftSchema, loadLatestApprovedOcr, type CanonicalOcr } from "./canonical_ocr";
import type { LocalProjectPersistence } from "./local_project_persistence";
import { ensureRustWasm } from "./rust_wasm_runtime";

const approvalSchema = z.object({ schemaVersion: z.literal(1), documentHash: sourceHashSchema,
  revision: z.number().int().positive(), attestation: z.literal("local_operator_confirmed") }).strict();
const promotionSchema = z.object({ schemaVersion: z.literal(1), sourceDocumentHash: sourceHashSchema,
  canonicalDocumentHash: sourceHashSchema, reviewHash: sourceHashSchema,
  approvedTextHash: sourceHashSchema, revision: z.number().int().positive(),
  attestation: z.literal("local_operator_confirmed"), document: documentIrV2Schema }).strict();
const envelopeSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal("native"),
  approval: approvalSchema, promotion: promotionSchema, draft: canonicalDraftSchema }).strict();
export type CanonicalNative = z.infer<typeof envelopeSchema>;
export type CanonicalText = CanonicalOcr | CanonicalNative;

export function canonicalArtifactKey(value: CanonicalText): string {
  return `${"kind" in value ? "canonical_native" : "canonical_ocr"}_${value.promotion.reviewHash.slice(7)}`;
}

export async function saveApprovedNative(persistence: LocalProjectPersistence,
  source: DocumentIrV2): Promise<CanonicalNative> {
  await ensureRustWasm();
  const latest = await persistence.loadLatest(source.documentId);
  const record = await persistence.loadArtifactRecord(source.documentId, "document_ir_v2");
  if (!latest || !record || latest.sourceHash !== source.sourceHash || !latest.artifactKeys.includes("document_ir_v2"))
    throw new Error("O documento não está no projeto ativo.");
  const sourceJson = JSON.stringify(source);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceJson));
  const storedHash = `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  if (record.contentHash !== storedHash) throw new Error("O texto do projeto mudou antes da aprovação.");
  const approval = approvalSchema.parse({ schemaVersion: 1, documentHash: document_v2_hash_json(sourceJson),
    revision: 1, attestation: "local_operator_confirmed" });
  const promotion = promotionSchema.parse(JSON.parse(approve_native_document_json(sourceJson, JSON.stringify(approval))));
  const draft = canonicalDraftSchema.parse(JSON.parse(build_narrative_draft_json(JSON.stringify(promotion.document))));
  const envelope = envelopeSchema.parse({ schemaVersion: 1, kind: "native", approval, promotion, draft });
  const artifactKey = canonicalArtifactKey(envelope);
  const existing = await persistence.loadArtifactRecord(source.documentId, artifactKey);
  if (existing) {
    const saved = envelopeSchema.parse(JSON.parse(await (await persistence.readArtifact(existing)).text()));
    if (JSON.stringify(saved) !== JSON.stringify(envelope)) throw new Error("A aprovação nativa salva diverge do documento.");
    return saved;
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

async function loadNative(persistence: LocalProjectPersistence, source: DocumentIrV2,
  key: string): Promise<CanonicalNative> {
  const record = await persistence.loadArtifactRecord(source.documentId, key);
  if (!record || record.kind !== "model" || record.mediaType !== "application/json" || record.sizeBytes > 32_000_000)
    throw new Error("A aprovação de texto nativo salva está indisponível.");
  const stored = envelopeSchema.parse(JSON.parse(await (await persistence.readArtifact(record)).text()));
  await ensureRustWasm();
  const fresh = promotionSchema.parse(JSON.parse(approve_native_document_json(JSON.stringify(source),
    JSON.stringify(stored.approval))));
  const draft = canonicalDraftSchema.parse(JSON.parse(build_narrative_draft_json(JSON.stringify(fresh.document))));
  if (JSON.stringify(fresh) !== JSON.stringify(stored.promotion)
    || JSON.stringify(draft) !== JSON.stringify(stored.draft)
    || canonicalArtifactKey(stored) !== key) throw new Error("A aprovação nativa não confere com o texto atual.");
  return stored;
}

export async function loadLatestCanonicalText(persistence: LocalProjectPersistence,
  source: DocumentIrV2): Promise<CanonicalText | null> {
  const latest = await persistence.loadLatest(source.documentId);
  if (!latest || latest.sourceHash !== source.sourceHash) return null;
  const key = [...latest.artifactKeys].reverse().find(value =>
    /^canonical_(native|ocr)_[0-9a-f]{64}$/.test(value));
  if (!key) return null;
  return key.startsWith("canonical_native_") ? await loadNative(persistence, source, key)
    : await loadLatestApprovedOcr(persistence, source);
}

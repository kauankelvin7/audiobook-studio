import { z } from "zod";
import { compose_approved_ocr_json } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { documentIrV2Schema, type DocumentIrV2 } from "../schemas/ingestion";
import { sourceHashSchema, storageIdSchema } from "../schemas/persistence";
import { loadApprovedOcrByKey } from "./canonical_ocr";
import type { LocalProjectPersistence } from "./local_project_persistence";
import { ensureRustWasm } from "./rust_wasm_runtime";

const referenceSchema = z.object({ pageNumber: z.number().int().positive(), regionId: z.string().min(1),
  reviewHash: sourceHashSchema, approvedTextHash: sourceHashSchema, revision: z.number().int().positive(),
  attestation: z.literal("local_operator_confirmed") }).strict();
const compositionSchema = z.object({ schemaVersion: z.literal(1), sourceDocumentHash: sourceHashSchema,
  canonicalDocumentHash: sourceHashSchema, compositionHash: sourceHashSchema,
  approvals: z.array(referenceSchema).min(2).max(8), document: documentIrV2Schema }).strict();
const envelopeSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal("ocr_composition"),
  canonicalKeys: z.array(storageIdSchema).min(2).max(8), composition: compositionSchema }).strict();
export type CanonicalOcrBatch = z.infer<typeof envelopeSchema>;

function batchKey(hash: string): string {
  return storageIdSchema.parse(`canonical_ocr_batch_${hash.slice(7)}`);
}

async function buildBatch(persistence: LocalProjectPersistence, source: DocumentIrV2,
  keysInput: string[]): Promise<CanonicalOcrBatch> {
  const keys = z.array(storageIdSchema).min(2).max(8).parse(keysInput);
  if (new Set(keys).size !== keys.length || keys.some(key => !/^canonical_ocr_[0-9a-f]{64}$/.test(key)))
    throw new Error("Selecione aprovações OCR distintas do projeto atual.");
  const reviews = await Promise.all(keys.map(key => loadApprovedOcrByKey(persistence, source, key)));
  await ensureRustWasm();
  const entries = reviews.map(({ canonical, review }) => ({ candidate: review.evidence.candidate,
    submission: review.submission, approval: canonical.approval }));
  const composition = compositionSchema.parse(JSON.parse(compose_approved_ocr_json(
    JSON.stringify(source), JSON.stringify(entries))));
  const keysByReview = new Map(reviews.map(({ canonical }, index) => [canonical.promotion.reviewHash, keys[index]]));
  const canonicalKeys = composition.approvals.map(reference => keysByReview.get(reference.reviewHash));
  if (canonicalKeys.some(key => !key)) throw new Error("Uma aprovação não pertence à composição OCR.");
  return envelopeSchema.parse({ schemaVersion: 1, kind: "ocr_composition", canonicalKeys, composition });
}

export async function saveApprovedOcrComposition(persistence: LocalProjectPersistence,
  source: DocumentIrV2, canonicalKeys: string[]): Promise<CanonicalOcrBatch> {
  const latest = await persistence.loadLatest(source.documentId);
  const active = await persistence.loadArtifactRecord(source.documentId, "document_ir_v2");
  if (!latest || !active || latest.sourceHash !== source.sourceHash
    || !latest.artifactKeys.includes("document_ir_v2")
    || canonicalKeys.some(key => !latest.artifactKeys.includes(key)))
    throw new Error("O documento ou uma aprovação OCR mudou no projeto ativo.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(source)));
  const sourceHash = `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  if (active.contentHash !== sourceHash) throw new Error("O documento ativo diverge da fonte da composição.");
  const envelope = await buildBatch(persistence, source, canonicalKeys);
  const key = batchKey(envelope.composition.compositionHash);
  const existing = await persistence.loadArtifactRecord(source.documentId, key);
  if (existing) {
    const stored = await loadApprovedOcrComposition(persistence, source, key);
    if (JSON.stringify(stored) !== JSON.stringify(envelope)) throw new Error("A composição OCR salva diverge das aprovações.");
    return stored;
  }
  const value = new Blob([JSON.stringify(envelope)], { type: "application/json" });
  if (value.size > 32_000_000) throw new Error("A composição OCR excede o limite de armazenamento.");
  const createdAtMs = Date.now();
  try {
    await persistence.persistNext({ schemaVersion: 1, projectId: latest.projectId, createdAtMs,
      pipelineVersion: latest.pipelineVersion, sourceHash: latest.sourceHash, job: latest.job,
      artifactKeys: [...new Set([...latest.artifactKeys, key])],
    }, [{ projectId: latest.projectId, artifactKey: key, kind: "model", mediaType: "application/json",
      value, createdAtMs, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null }], latest.checksum);
  } catch (error) {
    try {
      const saved = await loadApprovedOcrComposition(persistence, source, key);
      if (JSON.stringify(saved) === JSON.stringify(envelope)) return saved;
    } catch { /* Keep the original write failure when no matching batch was committed. */ }
    throw error;
  }
  return envelope;
}

export async function loadApprovedOcrComposition(persistence: LocalProjectPersistence,
  source: DocumentIrV2, key: string): Promise<CanonicalOcrBatch> {
  if (!/^canonical_ocr_batch_[0-9a-f]{64}$/.test(key)) throw new Error("Chave de composição OCR inválida.");
  const latest = await persistence.loadLatest(source.documentId);
  if (!latest || latest.sourceHash !== source.sourceHash || !latest.artifactKeys.includes(key))
    throw new Error("A composição OCR não pertence ao projeto ativo.");
  const record = await persistence.loadArtifactRecord(source.documentId, key);
  if (!record || record.kind !== "model" || record.mediaType !== "application/json" || !record.pinned
    || record.regenerable || record.finalArtifact || record.sizeBytes > 32_000_000)
    throw new Error("A composição OCR salva está indisponível.");
  const stored = envelopeSchema.parse(JSON.parse(await (await persistence.readArtifact(record)).text()));
  if (key !== batchKey(stored.composition.compositionHash)
    || stored.canonicalKeys.some(canonicalKey => !latest.artifactKeys.includes(canonicalKey)))
    throw new Error("A composição OCR salva aponta para outra revisão.");
  const fresh = await buildBatch(persistence, source, stored.canonicalKeys);
  if (JSON.stringify(fresh) !== JSON.stringify(stored)
    || (await persistence.loadLatest(source.documentId))?.checksum !== latest.checksum)
    throw new Error("A composição OCR salva não confere com as aprovações atuais.");
  return stored;
}

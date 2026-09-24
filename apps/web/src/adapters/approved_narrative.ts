import { z } from "zod";
import { approve_narrative_script_json } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { narrationQaSchema, narrativePlanSchema, narrativeScriptSchema, speechUnitSchema,
  type NarrativeScript } from "../schemas/narrative";
import { scriptReviewReceiptSchema, scriptReviewSubmissionSchema } from "../schemas/review";
import { sourceHashSchema } from "../schemas/persistence";
import type { DocumentIrV2 } from "../schemas/ingestion";
import { buildScriptReviewPacket, validateScriptReviewSubmission } from "./rust_script_pipeline";
import { canonicalArtifactKey, loadLatestCanonicalText, type CanonicalText } from "./canonical_native";
import type { LocalProjectPersistence } from "./local_project_persistence";
import { ensureRustWasm } from "./rust_wasm_runtime";

const localApprovalSchema = z.object({ schemaVersion: z.literal(1), canonicalDocumentHash: sourceHashSchema,
  scriptHash: sourceHashSchema, submissionHash: sourceHashSchema, revision: z.number().int().positive(),
  attestation: z.literal("local_operator_confirmed") }).strict();
const approvedSchema = z.object({ schemaVersion: z.literal(1), canonicalDocumentHash: sourceHashSchema,
  plan: narrativePlanSchema, script: narrativeScriptSchema, qa: narrationQaSchema,
  reviewReceipt: scriptReviewReceiptSchema, approval: localApprovalSchema,
  speechUnits: z.array(speechUnitSchema.extend({ chapterId: z.string().min(1) }).strict()).min(1) }).strict();
const envelopeSchema = z.object({ schemaVersion: z.literal(1), canonicalReviewHash: sourceHashSchema,
  submission: scriptReviewSubmissionSchema, approved: approvedSchema }).strict();
export type ApprovedNarrativeRecord = z.infer<typeof envelopeSchema>;

export async function saveApprovedNarrative(persistence: LocalProjectPersistence, source: DocumentIrV2,
  canonical: CanonicalText, scriptInput: NarrativeScript, rationale: string): Promise<ApprovedNarrativeRecord> {
  if (!rationale.trim()) throw new Error("Registre por que o roteiro está fiel ao texto aprovado.");
  const script = narrativeScriptSchema.parse(scriptInput);
  const draft = canonical.draft;
  const packet = await buildScriptReviewPacket(script.planId, script, draft.plan,
    draft.contentModel, draft.semanticOutline);
  const submission = scriptReviewSubmissionSchema.parse({ schemaVersion: 1,
    planId: packet.planId, documentId: packet.documentId, sourceHash: packet.sourceHash,
    contentHash: packet.contentHash, planHash: packet.planHash, scriptHash: packet.scriptHash,
    decisions: packet.segments.map(segment => ({ segmentId: segment.segmentId, verdict: "supported",
      evidenceSourceUnitIds: [...new Set(segment.sources.map(item => item.sourceUnitId))], rationale })) });
  const receipt = await validateScriptReviewSubmission(script.planId, script, draft.plan,
    draft.contentModel, draft.semanticOutline, submission);
  const approval = localApprovalSchema.parse({ schemaVersion: 1,
    canonicalDocumentHash: canonical.promotion.canonicalDocumentHash,
    scriptHash: packet.scriptHash, submissionHash: receipt.submissionHash,
    revision: 1, attestation: "local_operator_confirmed" });
  await ensureRustWasm();
  const approved = approvedSchema.parse(JSON.parse(approve_narrative_script_json(
    JSON.stringify(canonical.promotion.document), JSON.stringify(script),
    JSON.stringify(submission), JSON.stringify(approval))));
  if (approved.qa.status === "fail" || approved.qa.duplicatedSpokenHeadings > 0 || approved.qa.unsupportedClaims > 0)
    throw new Error("O QA narrativo encontrou um erro crítico.");
  const latest = await persistence.loadLatest(source.documentId);
  const canonicalKey = canonicalArtifactKey(canonical);
  if (!latest || latest.sourceHash !== source.sourceHash || !latest.artifactKeys.includes(canonicalKey))
    throw new Error("O texto aprovado não está no projeto ativo.");
  const envelope = envelopeSchema.parse({ schemaVersion: 1, canonicalReviewHash: canonical.promotion.reviewHash,
    submission, approved });
  const artifactKey = `approved_narrative_${packet.scriptHash.slice(7)}`;
  const existing = await persistence.loadArtifactRecord(source.documentId, artifactKey);
  if (existing) {
    const saved = envelopeSchema.parse(JSON.parse(await (await persistence.readArtifact(existing)).text()));
    if (JSON.stringify(saved) !== JSON.stringify(envelope)) throw new Error("A aprovação narrativa salva diverge do roteiro atual.");
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

export async function loadLatestApprovedNarrative(persistence: LocalProjectPersistence,
  source: DocumentIrV2): Promise<ApprovedNarrativeRecord | null> {
  const canonical = await loadLatestCanonicalText(persistence, source);
  if (!canonical) return null;
  const latest = await persistence.loadLatest(source.documentId);
  if (!latest) return null;
  let stored: ApprovedNarrativeRecord | null = null;
  for (const key of [...latest.artifactKeys].reverse()) {
    if (!/^approved_narrative_[0-9a-f]{64}$/.test(key)) continue;
    const record = await persistence.loadArtifactRecord(source.documentId, key);
    if (!record || record.kind !== "model" || record.mediaType !== "application/json" || record.sizeBytes > 32_000_000)
      throw new Error("O roteiro aprovado salvo não está disponível.");
    const candidate = envelopeSchema.parse(JSON.parse(await (await persistence.readArtifact(record)).text()));
    if (candidate.canonicalReviewHash === canonical.promotion.reviewHash) { stored = candidate; break; }
  }
  if (!stored) return null;
  await ensureRustWasm();
  const fresh = approvedSchema.parse(JSON.parse(approve_narrative_script_json(
    JSON.stringify(canonical.promotion.document), JSON.stringify(stored.approved.script),
    JSON.stringify(stored.submission), JSON.stringify(stored.approved.approval))));
  if (JSON.stringify(fresh) !== JSON.stringify(stored.approved)) throw new Error("O roteiro salvo não passou na revalidação Rust.");
  return stored;
}

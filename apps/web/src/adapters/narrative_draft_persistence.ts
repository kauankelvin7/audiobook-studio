import { z } from "zod";
import type { DocumentIrV2 } from "../schemas/ingestion";
import { narrativeScriptSchema, type NarrativeScript } from "../schemas/narrative";
import { sourceHashSchema } from "../schemas/persistence";
import { canonicalArtifactKey, type CanonicalText } from "./canonical_native";
import type { LocalProjectPersistence } from "./local_project_persistence";
import { buildScriptQa } from "./rust_script_pipeline";

const limit = 32_000_000;
const prefix = "narrative_draft_";
const envelopeSchema = z.object({ schemaVersion: z.literal(1), sourceHash: sourceHashSchema,
  canonicalReviewHash: sourceHashSchema, canonicalDocumentHash: sourceHashSchema,
  script: narrativeScriptSchema }).strict();

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function validateCandidate(script: NarrativeScript, canonical: CanonicalText): Promise<void> {
  const draft = canonical.draft;
  // A draft may contain QA findings, but it must retain valid structure and sources.
  // Core validation throws for invalid references/identities; no approval is created here.
  await buildScriptQa(draft.script.planId, script, draft.plan, draft.contentModel, draft.semanticOutline);
}

export async function saveNarrativeDraft(persistence: LocalProjectPersistence, source: DocumentIrV2,
  canonical: CanonicalText, script: NarrativeScript): Promise<void> {
  const envelope = envelopeSchema.parse({ schemaVersion: 1, sourceHash: source.sourceHash,
    canonicalReviewHash: canonical.promotion.reviewHash,
    canonicalDocumentHash: canonical.promotion.canonicalDocumentHash, script });
  const serialized = JSON.stringify(envelope);
  const value = new Blob([serialized], { type: "application/json" });
  if (value.size > limit) throw new Error("O rascunho é grande demais para salvar neste dispositivo.");
  await validateCandidate(envelope.script, canonical);
  const latest = await persistence.loadLatest(source.documentId);
  const activeCanonicalKey = latest && [...latest.artifactKeys].reverse().find(key => /^canonical_(native|ocr)_[0-9a-f]{64}$/.test(key));
  if (!latest || latest.sourceHash !== source.sourceHash || activeCanonicalKey !== canonicalArtifactKey(canonical))
    throw new Error("O texto aprovado mudou. Reabra a narrativa antes de salvar o rascunho.");
  const artifactKey = prefix + await hash(serialized);
  const existing = await persistence.loadArtifactRecord(source.documentId, artifactKey);
  if (existing && await (await persistence.readArtifact(existing)).text() !== serialized)
    throw new Error("O rascunho salvo não confere com o texto atual.");
  const createdAtMs = Date.now();
  // Move an existing content-addressed draft to the end when the user restores it.
  const artifactKeys = [...latest.artifactKeys.filter(key => key !== artifactKey), artifactKey];
  if (existing && latest.artifactKeys.at(-1) === artifactKey) return;
  await persistence.persistNext({ schemaVersion: 1, projectId: latest.projectId, createdAtMs,
    pipelineVersion: latest.pipelineVersion, sourceHash: latest.sourceHash, job: latest.job, artifactKeys },
  existing ? [] : [{ projectId: latest.projectId, artifactKey, kind: "model", mediaType: "application/json",
    value, createdAtMs, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null }], latest.checksum);
}

export async function loadNarrativeDraft(persistence: LocalProjectPersistence, source: DocumentIrV2,
  canonical: CanonicalText): Promise<NarrativeScript | null> {
  const latest = await persistence.loadLatest(source.documentId);
  if (!latest || latest.sourceHash !== source.sourceHash) return null;
  const activeCanonicalKey = [...latest.artifactKeys].reverse().find(key => /^canonical_(native|ocr)_[0-9a-f]{64}$/.test(key));
  if (activeCanonicalKey !== canonicalArtifactKey(canonical)) return null;
  for (const key of [...latest.artifactKeys].reverse()) {
    if (!/^narrative_draft_[0-9a-f]{64}$/.test(key)) continue;
    const record = await persistence.loadArtifactRecord(source.documentId, key);
    if (!record || record.kind !== "model" || record.mediaType !== "application/json" || record.sizeBytes > limit)
      throw new Error("O rascunho salvo está indisponível. Prepare o roteiro novamente.");
    const blob = await persistence.readArtifact(record);
    if (blob.size > limit) throw new Error("O rascunho salvo é grande demais para reabrir.");
    const text = await blob.text();
    if (prefix + await hash(text) !== key) throw new Error("O rascunho salvo não passou na conferência de integridade.");
    const envelope = envelopeSchema.parse(JSON.parse(text));
    if (envelope.sourceHash !== source.sourceHash || envelope.canonicalReviewHash !== canonical.promotion.reviewHash
      || envelope.canonicalDocumentHash !== canonical.promotion.canonicalDocumentHash) continue;
    await validateCandidate(envelope.script, canonical);
    return envelope.script;
  }
  return null;
}

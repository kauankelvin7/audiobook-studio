import { z } from "zod";
import { artifactManifestRecordSchema, storageIdSchema, type ArtifactManifestRecord } from "../schemas/persistence";
import { ocrReviewReceiptSchema, ocrReviewSubmissionSchema, type OcrReviewReceipt,
  type OcrReviewSubmission } from "../schemas/ocr_candidate";
import type { DocumentIrV2 } from "../schemas/ingestion";
import { LocalProjectPersistence } from "./local_project_persistence";
import { OcrEvidencePersistence, type SavedOcrEvidence } from "./ocr_evidence_persistence";
import { buildOcrReviewReceipt } from "./rust_ocr_candidate";

const envelopeSchema = z.object({
  schemaVersion: z.literal(1),
  evidenceImageKey: storageIdSchema,
  evidenceRecordKey: storageIdSchema,
  submission: ocrReviewSubmissionSchema,
  receipt: ocrReviewReceiptSchema,
}).strict();

export type OcrReviewPersistenceErrorCode = "NO_PROJECT" | "SOURCE_CHANGED" | "WRONG_ARTIFACT"
  | "INVALID_REVIEW" | "CHECKPOINT_CHANGED";

export class OcrReviewPersistenceError extends Error {
  constructor(public readonly code: OcrReviewPersistenceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OcrReviewPersistenceError";
  }
}

export type SavedOcrReview = {
  artifact: ArtifactManifestRecord;
  evidence: SavedOcrEvidence;
  submission: OcrReviewSubmission;
  receipt: OcrReviewReceipt;
  currentness: "not_established";
};

function reviewKey(reviewHash: string): string {
  return storageIdSchema.parse(`ocr_review_${reviewHash.slice("sha256:".length)}`);
}

export class OcrReviewPersistence {
  private readonly evidence: OcrEvidencePersistence;

  constructor(private readonly persistence: LocalProjectPersistence) {
    this.evidence = new OcrEvidencePersistence(persistence);
  }

  async save(projectIdInput: string, document: DocumentIrV2, imageArtifact: ArtifactManifestRecord,
    recordArtifact: ArtifactManifestRecord, submissionInput: unknown): Promise<SavedOcrReview> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const parsed = ocrReviewSubmissionSchema.safeParse(submissionInput);
    if (!parsed.success) throw new OcrReviewPersistenceError("INVALID_REVIEW", "A submissão OCR está inválida.", { cause: parsed.error });
    const submission = parsed.data;
    const latest = await this.persistence.loadLatest(projectId);
    if (!latest) throw new OcrReviewPersistenceError("NO_PROJECT", "O projeto não tem checkpoint local.");
    if (latest.sourceHash !== document.sourceHash) {
      throw new OcrReviewPersistenceError("SOURCE_CHANGED", "A fonte ativa mudou antes de salvar a revisão OCR.");
    }
    if (!latest.artifactKeys.includes(imageArtifact.artifactKey) || !latest.artifactKeys.includes(recordArtifact.artifactKey)) {
      throw new OcrReviewPersistenceError("WRONG_ARTIFACT", "A evidência OCR não pertence ao checkpoint ativo.");
    }
    const evidence = await this.evidence.readHistorical(projectId, document, imageArtifact, recordArtifact);
    const receipt = await buildOcrReviewReceipt(document, evidence.candidate, submission);
    if (receipt.candidateReceiptHash !== evidence.receipt.receiptHash) {
      throw new OcrReviewPersistenceError("INVALID_REVIEW", "A revisão não confere com a evidência OCR.");
    }
    const key = reviewKey(receipt.reviewHash);
    const existing = await this.persistence.loadArtifactRecord(projectId, key);
    if (existing) {
      const saved = await this.readHistorical(projectId, document, existing, imageArtifact, recordArtifact);
      if ((await this.persistence.loadLatest(projectId))?.checksum !== latest.checksum) {
        throw new OcrReviewPersistenceError("CHECKPOINT_CHANGED", "O projeto mudou durante a retomada da revisão OCR.");
      }
      return saved;
    }
    const createdAtMs = Date.now();
    const value = new Blob([JSON.stringify({ schemaVersion: 1, evidenceImageKey: imageArtifact.artifactKey,
      evidenceRecordKey: recordArtifact.artifactKey, submission, receipt })], { type: "application/json" });
    if (value.size > 8_000_000) {
      throw new OcrReviewPersistenceError("INVALID_REVIEW", "O registro da revisão OCR excede o limite.");
    }
    const stored = await this.persistence.persistNext({
      schemaVersion: 1, projectId, createdAtMs, pipelineVersion: latest.pipelineVersion,
      sourceHash: latest.sourceHash, job: latest.job,
      artifactKeys: [...new Set([...latest.artifactKeys, key])],
    }, [{ projectId, artifactKey: key, kind: "ocr_review_submission", value,
      mediaType: "application/json", createdAtMs, regenerable: false, pinned: true,
      finalArtifact: false, expiresAtMs: null }], latest.checksum);
    const artifact = stored.artifacts.find(item => item.artifactKey === key);
    if (!artifact) throw new OcrReviewPersistenceError("INVALID_REVIEW", "O manifest da revisão OCR não foi confirmado.");
    return { artifact, evidence, submission, receipt, currentness: "not_established" };
  }

  async readHistorical(projectIdInput: string, document: DocumentIrV2, artifactInput: ArtifactManifestRecord,
    imageInput: ArtifactManifestRecord, recordInput: ArtifactManifestRecord): Promise<SavedOcrReview> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const artifact = artifactManifestRecordSchema.parse(artifactInput);
    if (artifact.projectId !== projectId || artifact.kind !== "ocr_review_submission"
      || artifact.mediaType !== "application/json" || !artifact.pinned || artifact.regenerable
      || artifact.finalArtifact || artifact.sizeBytes > 8_000_000) {
      throw new OcrReviewPersistenceError("WRONG_ARTIFACT", "O manifest não é uma revisão OCR deste projeto.");
    }
    const latest = await this.persistence.loadLatest(projectId);
    if (!latest) throw new OcrReviewPersistenceError("NO_PROJECT", "O projeto não tem checkpoint local.");
    const manifest = await this.persistence.loadArtifactRecord(projectId, artifact.artifactKey);
    if (JSON.stringify(manifest) !== JSON.stringify(artifact)
      || !await this.persistence.hasHistoricalArtifactSet(projectId,
        [artifact.artifactKey, imageInput.artifactKey, recordInput.artifactKey])) {
      throw new OcrReviewPersistenceError("WRONG_ARTIFACT", "A revisão OCR não está vinculada à evidência no histórico.");
    }
    const evidence = await this.evidence.readHistorical(projectId, document, imageInput, recordInput);
    const blob = await this.persistence.readArtifact(artifact);
    let envelope: z.infer<typeof envelopeSchema>;
    try { envelope = envelopeSchema.parse(JSON.parse(await blob.text())); }
    catch (error) { throw new OcrReviewPersistenceError("INVALID_REVIEW", "O registro de revisão OCR está inválido.", { cause: error }); }
    if (envelope.evidenceImageKey !== imageInput.artifactKey || envelope.evidenceRecordKey !== recordInput.artifactKey
      || artifact.artifactKey !== reviewKey(envelope.receipt.reviewHash)) {
      throw new OcrReviewPersistenceError("WRONG_ARTIFACT", "A revisão OCR aponta para outra evidência.");
    }
    const fresh = await buildOcrReviewReceipt(document, evidence.candidate, envelope.submission);
    if (JSON.stringify(fresh) !== JSON.stringify(envelope.receipt)
      || fresh.candidateReceiptHash !== evidence.receipt.receiptHash) {
      throw new OcrReviewPersistenceError("INVALID_REVIEW", "O recibo da revisão OCR não confere com a evidência.");
    }
    if ((await this.persistence.loadLatest(projectId))?.checksum !== latest.checksum) {
      throw new OcrReviewPersistenceError("CHECKPOINT_CHANGED", "O projeto mudou durante a leitura da revisão OCR.");
    }
    return { artifact, evidence, submission: envelope.submission, receipt: fresh, currentness: "not_established" };
  }
}

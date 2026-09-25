import { artifactManifestRecordSchema, storageIdSchema, type ArtifactManifestRecord } from "../schemas/persistence";
import { scriptReviewReceiptSchema, scriptReviewSubmissionSchema, type ScriptReviewReceipt, type ScriptReviewSubmission } from "../schemas/review";
import { ActiveNarrativePersistence } from "./active_narrative_persistence";
import { LocalProjectPersistence } from "./local_project_persistence";
import { evaluateReviewAgainstActive, validateScriptReviewSubmission } from "./rust_script_pipeline";

export type ReviewContext = {
  expectedPlanId: string;
  script: unknown;
  plan: unknown;
  content: unknown;
  outline: unknown;
};

export type SavedReviewSubmission = {
  artifact: ArtifactManifestRecord;
  submission: ScriptReviewSubmission;
  receipt: ScriptReviewReceipt;
  boundActiveIdentityHash: string | null;
  bindingHash: string | null;
  currentness: "not_established";
};

export type ReviewPersistenceErrorCode = "NO_PROJECT" | "NO_ACTIVE_NARRATIVE" | "SOURCE_CHANGED" | "WRONG_ARTIFACT" | "RECEIPT_MISMATCH" | "INVALID_SUBMISSION" | "CHECKPOINT_CHANGED";

export class ReviewPersistenceError extends Error {
  constructor(public readonly code: ReviewPersistenceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReviewPersistenceError";
  }
}

function artifactKey(submissionHash: string): string {
  return storageIdSchema.parse(`review_${submissionHash.slice("sha256:".length)}`);
}

export class ReviewSubmissionPersistence {
  constructor(private readonly persistence: LocalProjectPersistence) {}

  async save(projectIdInput: string, context: ReviewContext, submissionInput: unknown): Promise<SavedReviewSubmission> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const parsed = scriptReviewSubmissionSchema.safeParse(submissionInput);
    if (!parsed.success) throw new ReviewPersistenceError("INVALID_SUBMISSION", "A submissão de revisão está inválida.", { cause: parsed.error });
    const submission = parsed.data;
    const receipt = await validateScriptReviewSubmission(
      context.expectedPlanId, context.script, context.plan, context.content, context.outline, submission,
    );
    const latest = await this.persistence.loadLatest(projectId);
    if (!latest) throw new ReviewPersistenceError("NO_PROJECT", "O projeto ainda não tem checkpoint local.");
    if (latest.sourceHash !== receipt.sourceHash) {
      throw new ReviewPersistenceError("SOURCE_CHANGED", "A fonte do projeto mudou desde a revisão.");
    }

    const key = artifactKey(receipt.submissionHash);
    const createdAtMs = Date.now();
    const value = new Blob([JSON.stringify({ schemaVersion: 1, submission, receipt })], { type: "application/json" });
    const result = await this.persistence.persistNext({
      schemaVersion: 1,
      projectId,
      createdAtMs,
      pipelineVersion: latest.pipelineVersion,
      sourceHash: latest.sourceHash,
      job: latest.job,
      artifactKeys: [...new Set([...latest.artifactKeys, key])],
    }, [{
      projectId,
      artifactKey: key,
      kind: "review_submission",
      value,
      mediaType: "application/json",
      createdAtMs,
      regenerable: false,
      pinned: true,
      finalArtifact: false,
      expiresAtMs: null,
    }], latest.checksum);
    const artifact = result.artifacts.find(record => record.artifactKey === key);
    if (!artifact) throw new ReviewPersistenceError("RECEIPT_MISMATCH", "O manifest da revisão não foi confirmado.");
    return { artifact, submission, receipt, boundActiveIdentityHash: null, bindingHash: null, currentness: "not_established" };
  }

  async saveForActive(projectIdInput: string, context: ReviewContext, submissionInput: unknown): Promise<SavedReviewSubmission> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const active = await new ActiveNarrativePersistence(this.persistence).loadActiveAgainstContext(projectId, context);
    if (!active) throw new ReviewPersistenceError("NO_ACTIVE_NARRATIVE", "O projeto ainda não tem narrativa ativa.");
    const parsed = scriptReviewSubmissionSchema.safeParse(submissionInput);
    if (!parsed.success) throw new ReviewPersistenceError("INVALID_SUBMISSION", "A submissão de revisão está inválida.", { cause: parsed.error });
    const submission = parsed.data;
    const receipt = await validateScriptReviewSubmission(
      context.expectedPlanId, context.script, context.plan, context.content, context.outline, submission,
    );
    const evaluation = await evaluateReviewAgainstActive(
      context.expectedPlanId, context.script, context.plan, context.content, context.outline,
      submission, active.identity.identityHash, null,
    );
    if (evaluation.submissionHash !== receipt.submissionHash) {
      throw new ReviewPersistenceError("RECEIPT_MISMATCH", "O recibo não confere com a revisão da narrativa ativa.");
    }
    const key = artifactKey(evaluation.bindingHash);
    const createdAtMs = Date.now();
    const value = new Blob([JSON.stringify({
      schemaVersion: 2,
      activeIdentityHash: active.identity.identityHash,
      bindingHash: evaluation.bindingHash,
      submission,
      receipt,
    })], { type: "application/json" });
    const result = await this.persistence.persistNext({
      schemaVersion: 1,
      projectId,
      createdAtMs,
      pipelineVersion: active.checkpoint.pipelineVersion,
      sourceHash: active.checkpoint.sourceHash,
      job: active.checkpoint.job,
      artifactKeys: [...new Set([...active.checkpoint.artifactKeys, key])],
    }, [{
      projectId, artifactKey: key, kind: "review_submission", value,
      mediaType: "application/json", createdAtMs, regenerable: false,
      pinned: true, finalArtifact: false, expiresAtMs: null,
    }], active.checkpoint.checksum);
    const artifact = result.artifacts.find(record => record.artifactKey === key);
    if (!artifact) throw new ReviewPersistenceError("RECEIPT_MISMATCH", "O manifest da revisão não foi confirmado.");
    return {
      artifact, submission, receipt,
      boundActiveIdentityHash: active.identity.identityHash,
      bindingHash: evaluation.bindingHash,
      currentness: "not_established",
    };
  }

  async readHistoricalAgainstContext(projectIdInput: string, artifact: ArtifactManifestRecord, context: ReviewContext): Promise<SavedReviewSubmission> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const parsedArtifact = artifactManifestRecordSchema.safeParse(artifact);
    if (!parsedArtifact.success) {
      throw new ReviewPersistenceError("WRONG_ARTIFACT", "O manifest da revisão está inválido.", { cause: parsedArtifact.error });
    }
    artifact = parsedArtifact.data;
    if (artifact.projectId !== projectId || artifact.kind !== "review_submission" || !artifact.pinned || artifact.regenerable) {
      throw new ReviewPersistenceError("WRONG_ARTIFACT", "O artefato não é uma revisão deste projeto.");
    }
    const latest = await this.persistence.loadLatest(projectId);
    const manifest = await this.persistence.loadArtifactRecord(projectId, artifact.artifactKey);
    if (!manifest || JSON.stringify(manifest) !== JSON.stringify(artifact)) {
      throw new ReviewPersistenceError("WRONG_ARTIFACT", "O manifest da revisão não confere com o projeto.");
    }
    const value = await this.persistence.readArtifact(artifact);
    let stored: unknown;
    try {
      stored = JSON.parse(await value.text());
    } catch (error) {
      throw new ReviewPersistenceError("RECEIPT_MISMATCH", "O registro da revisão está inválido.", { cause: error });
    }
    const envelope = stored as {
      schemaVersion?: unknown;
      activeIdentityHash?: unknown;
      bindingHash?: unknown;
      submission?: unknown;
      receipt?: unknown;
    };
    if (envelope?.schemaVersion !== 1 && envelope?.schemaVersion !== 2) {
      throw new ReviewPersistenceError("RECEIPT_MISMATCH", "A versão da revisão não é suportada.");
    }
    const boundActiveIdentityHash = envelope.schemaVersion === 2 && typeof envelope.activeIdentityHash === "string"
      ? envelope.activeIdentityHash : null;
    const bindingHash = envelope.schemaVersion === 2 && typeof envelope.bindingHash === "string"
      ? envelope.bindingHash : null;
    if (envelope.schemaVersion === 2 && (!boundActiveIdentityHash || !bindingHash)) {
      throw new ReviewPersistenceError("RECEIPT_MISMATCH", "O vínculo da revisão está incompleto.");
    }
    const parsedSubmission = scriptReviewSubmissionSchema.safeParse(envelope.submission);
    const parsedReceipt = scriptReviewReceiptSchema.safeParse(envelope.receipt);
    if (!parsedSubmission.success || !parsedReceipt.success) {
      throw new ReviewPersistenceError("RECEIPT_MISMATCH", "O registro da revisão está inválido.");
    }
    const submission = parsedSubmission.data;
    const receipt = parsedReceipt.data;
    if (artifact.artifactKey !== artifactKey(bindingHash ?? receipt.submissionHash)) {
      throw new ReviewPersistenceError("RECEIPT_MISMATCH", "A chave do artefato não confere com o recibo salvo.");
    }
    const fresh = await validateScriptReviewSubmission(
      context.expectedPlanId, context.script, context.plan, context.content, context.outline, submission,
    );
    if (JSON.stringify(fresh) !== JSON.stringify(receipt)) {
      throw new ReviewPersistenceError("RECEIPT_MISMATCH", "O recibo salvo não confere com o contexto fornecido.");
    }
    if (boundActiveIdentityHash && bindingHash) {
      const evaluation = await evaluateReviewAgainstActive(
        context.expectedPlanId, context.script, context.plan, context.content, context.outline,
        submission, boundActiveIdentityHash, bindingHash,
      );
      if (evaluation.submissionHash !== receipt.submissionHash) {
        throw new ReviewPersistenceError("RECEIPT_MISMATCH", "O vínculo salvo não confere com o recibo.");
      }
    }
    const latestAfterRead = await this.persistence.loadLatest(projectId);
    if (latestAfterRead?.checksum !== latest?.checksum) {
      throw new ReviewPersistenceError("CHECKPOINT_CHANGED", "O projeto mudou durante a leitura da revisão.");
    }
    return { artifact, submission, receipt: fresh, boundActiveIdentityHash, bindingHash, currentness: "not_established" };
  }
}

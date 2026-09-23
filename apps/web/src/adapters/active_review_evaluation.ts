import { storageIdSchema, type ArtifactManifestRecord, type CheckpointRecord } from "../schemas/persistence";
import type { ActiveReviewEvaluation, ScriptReviewReceipt } from "../schemas/review";
import { ActiveNarrativePersistence } from "./active_narrative_persistence";
import { LocalProjectPersistence } from "./local_project_persistence";
import { ReviewSubmissionPersistence, type ReviewContext } from "./review_submission_persistence";
import { evaluateReviewAgainstActive } from "./rust_script_pipeline";

export type ActiveReviewErrorCode = "NO_ACTIVE_NARRATIVE" | "RECEIPT_MISMATCH" | "CHECKPOINT_CHANGED";

export class ActiveReviewError extends Error {
  constructor(public readonly code: ActiveReviewErrorCode, message: string) {
    super(message);
    this.name = "ActiveReviewError";
  }
}

export type ActiveReviewRecord = {
  evaluation: ActiveReviewEvaluation;
  receipt: ScriptReviewReceipt;
  reviewArtifact: ArtifactManifestRecord;
  activeArtifact: ArtifactManifestRecord;
  checkpoint: CheckpointRecord;
};

export class ActiveReviewEvaluator {
  private readonly active: ActiveNarrativePersistence;
  private readonly reviews: ReviewSubmissionPersistence;

  constructor(private readonly persistence: LocalProjectPersistence) {
    this.active = new ActiveNarrativePersistence(persistence);
    this.reviews = new ReviewSubmissionPersistence(persistence);
  }

  async evaluate(
    projectIdInput: string,
    reviewArtifact: ArtifactManifestRecord,
    context: ReviewContext,
  ): Promise<ActiveReviewRecord> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const active = await this.active.loadActiveAgainstContext(projectId, context);
    if (!active) {
      throw new ActiveReviewError("NO_ACTIVE_NARRATIVE", "O projeto ainda não tem narrativa ativa.");
    }
    const review = await this.reviews.readHistoricalAgainstContext(projectId, reviewArtifact, context);
    const evaluation = await evaluateReviewAgainstActive(
      context.expectedPlanId,
      context.script,
      context.plan,
      context.content,
      context.outline,
      review.submission,
      active.identity.identityHash,
      review.bindingHash,
    );
    if (evaluation.submissionHash !== review.receipt.submissionHash) {
      throw new ActiveReviewError("RECEIPT_MISMATCH", "O recibo salvo não confere com a revisão da narrativa ativa.");
    }
    const latest = await this.persistence.loadLatest(projectId);
    if (latest?.checksum !== active.checkpoint.checksum) {
      throw new ActiveReviewError("CHECKPOINT_CHANGED", "O projeto mudou durante a avaliação da revisão.");
    }
    return {
      evaluation,
      receipt: review.receipt,
      reviewArtifact: review.artifact,
      activeArtifact: active.artifact,
      checkpoint: active.checkpoint,
    };
  }
}

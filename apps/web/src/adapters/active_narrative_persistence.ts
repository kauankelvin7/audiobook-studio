import { storageIdSchema, type ArtifactManifestRecord, type CheckpointRecord } from "../schemas/persistence";
import { activeNarrativeIdentitySchema, type ActiveNarrativeIdentity } from "../schemas/review";
import { LocalProjectPersistence } from "./local_project_persistence";
import type { ReviewContext } from "./review_submission_persistence";
import { buildActiveNarrativeIdentity, validateActiveNarrativeActivation } from "./rust_script_pipeline";

export type ActiveNarrativeErrorCode =
  | "NO_PROJECT" | "SOURCE_CHANGED" | "MULTIPLE_ACTIVE" | "INVALID_POINTER"
  | "MISSING_ARTIFACT" | "IDENTITY_MISMATCH" | "CHECKPOINT_CHANGED" | "AUDIO_ARTIFACT_PRESENT";

export class ActiveNarrativeError extends Error {
  constructor(public readonly code: ActiveNarrativeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveNarrativeError";
  }
}

export type ActiveNarrativeRecord = {
  identity: ActiveNarrativeIdentity;
  artifact: ArtifactManifestRecord;
  checkpoint: CheckpointRecord;
};

function identityKey(identityHash: string): string {
  return storageIdSchema.parse(`active_${identityHash.slice("sha256:".length)}`);
}

export class ActiveNarrativePersistence {
  constructor(private readonly persistence: LocalProjectPersistence) {}

  async activate(projectIdInput: string, context: ReviewContext): Promise<ActiveNarrativeRecord> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const identity = await buildActiveNarrativeIdentity(
      context.expectedPlanId, context.script, context.plan, context.content, context.outline,
    );
    const latest = await this.persistence.loadLatest(projectId);
    if (!latest) throw new ActiveNarrativeError("NO_PROJECT", "O projeto ainda não tem checkpoint local.");
    if (latest.sourceHash !== identity.sourceHash) {
      throw new ActiveNarrativeError("SOURCE_CHANGED", "A fonte da narrativa não confere com o projeto.");
    }
    await validateActiveNarrativeActivation(latest.job);
    const manifests = await this.persistence.listArtifactRecords(projectId);
    const byKey = new Map(manifests.map(record => [record.artifactKey, record]));
    for (const artifactKey of latest.artifactKeys) {
      const artifact = byKey.get(artifactKey);
      if (!artifact) throw new ActiveNarrativeError("INVALID_POINTER", "O checkpoint referencia um artefato sem manifest.");
      if (artifact.kind === "audio_chunk" || artifact.kind === "final_audio") {
        throw new ActiveNarrativeError("AUDIO_ARTIFACT_PRESENT", "Remova a referência ao áudio anterior antes de ativar outra narrativa.");
      }
    }
    const priorActiveKeys = await this.activeKeys(projectId, latest);
    if (priorActiveKeys.length > 1) {
      throw new ActiveNarrativeError("MULTIPLE_ACTIVE", "O projeto contém mais de uma narrativa ativa.");
    }
    const key = identityKey(identity.identityHash);
    const createdAtMs = Date.now();
    const result = await this.persistence.persistNext({
      schemaVersion: 1,
      projectId,
      createdAtMs,
      pipelineVersion: latest.pipelineVersion,
      sourceHash: latest.sourceHash,
      job: latest.job,
      artifactKeys: [...new Set([...latest.artifactKeys.filter(value => !priorActiveKeys.includes(value)), key])],
    }, [{
      projectId,
      artifactKey: key,
      kind: "active_narrative",
      value: new Blob([JSON.stringify(identity)], { type: "application/json" }),
      mediaType: "application/json",
      createdAtMs,
      regenerable: false,
      pinned: true,
      finalArtifact: false,
      expiresAtMs: null,
    }], latest.checksum);
    const artifact = result.artifacts.find(record => record.artifactKey === key);
    if (!artifact) throw new ActiveNarrativeError("MISSING_ARTIFACT", "O manifest da narrativa ativa não foi confirmado.");
    return { identity, artifact, checkpoint: result.checkpoint };
  }

  async loadActiveAgainstContext(projectIdInput: string, context: ReviewContext): Promise<ActiveNarrativeRecord | null> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const latest = await this.persistence.loadLatest(projectId);
    if (!latest) return null;
    const keys = await this.activeKeys(projectId, latest);
    if (keys.length === 0) return null;
    if (keys.length !== 1) throw new ActiveNarrativeError("MULTIPLE_ACTIVE", "O projeto contém mais de uma narrativa ativa.");
    const artifact = await this.persistence.loadArtifactRecord(projectId, keys[0]);
    if (!artifact || artifact.kind !== "active_narrative" || !artifact.pinned || artifact.regenerable) {
      throw new ActiveNarrativeError("MISSING_ARTIFACT", "O manifest da narrativa ativa está ausente ou inválido.");
    }
    const blob = await this.persistence.readArtifact(artifact);
    let stored: unknown;
    try {
      stored = JSON.parse(await blob.text());
    } catch (error) {
      throw new ActiveNarrativeError("IDENTITY_MISMATCH", "A identidade da narrativa ativa está corrompida.", { cause: error });
    }
    const parsed = activeNarrativeIdentitySchema.safeParse(stored);
    if (!parsed.success || keys[0] !== identityKey(parsed.data.identityHash) || parsed.data.sourceHash !== latest.sourceHash) {
      throw new ActiveNarrativeError("IDENTITY_MISMATCH", "A identidade da narrativa ativa não confere com o projeto.");
    }
    const actual = await buildActiveNarrativeIdentity(
      context.expectedPlanId, context.script, context.plan, context.content, context.outline,
    );
    if (JSON.stringify(actual) !== JSON.stringify(parsed.data)) {
      throw new ActiveNarrativeError("IDENTITY_MISMATCH", "O contexto fornecido não é a narrativa ativa.");
    }
    const latestAfterRead = await this.persistence.loadLatest(projectId);
    if (latestAfterRead?.checksum !== latest.checksum) {
      throw new ActiveNarrativeError("CHECKPOINT_CHANGED", "O projeto mudou durante a leitura da narrativa ativa.");
    }
    return { identity: actual, artifact, checkpoint: latest };
  }

  private async activeKeys(projectId: string, checkpoint: CheckpointRecord): Promise<string[]> {
    const manifests = await this.persistence.listArtifactRecords(projectId);
    const byKey = new Map(manifests.map(record => [record.artifactKey, record]));
    const keys: string[] = [];
    for (const key of checkpoint.artifactKeys) {
      const artifact = byKey.get(key);
      if (!key.startsWith("active_") && artifact?.kind !== "active_narrative") continue;
      if (!artifact || artifact.kind !== "active_narrative" || !key.startsWith("active_")) {
        throw new ActiveNarrativeError("INVALID_POINTER", "O checkpoint aponta para uma narrativa ativa inválida.");
      }
      keys.push(key);
    }
    return keys;
  }
}

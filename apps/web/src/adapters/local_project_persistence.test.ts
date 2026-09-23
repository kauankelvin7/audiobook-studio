import { webcrypto } from "node:crypto";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { CheckpointInput } from "../schemas/persistence";
import { IndexedDbCheckpointRepository } from "./indexeddb_checkpoint_repository";
import { LocalProjectPersistence } from "./local_project_persistence";
import { OpfsArtifactStore } from "./opfs_artifact_store";
import type { ArtifactWrite, ProjectLock } from "./ports";

class FakeDirectory {
  readonly files = new Map<string, Blob>();

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name) && !options?.create) throw new DOMException("missing", "NotFoundError");
    if (!this.files.has(name)) this.files.set(name, new Blob([]));
    return {
      getFile: async () => this.files.get(name)!,
      createWritable: async () => ({
        write: async (value: Blob) => { this.files.set(name, value); },
        close: async () => undefined,
        abort: async () => undefined,
      }),
    };
  }
  async removeEntry(name: string) {
    if (!this.files.delete(name)) throw new DOMException("missing", "NotFoundError");
  }

  async *keys() {
    for (const name of this.files.keys()) yield name;
  }
}

const directLock: ProjectLock = {
  runExclusive: async (_projectId, operation) => await operation(),
};

function checkpoint(sequence = 1): CheckpointInput {
  return {
    schemaVersion: 1,
    projectId: "project_1",
    sequence,
    createdAtMs: 1_700_000_000_000 + sequence,
    pipelineVersion: "m3.2",
    sourceHash: `sha256:${"a".repeat(64)}`,
    job: { state: "EXTRACTING", resumeState: null },
    artifactKeys: ["source_pdf"],
  };
}
function artifactWrite(value = "pdf bytes"): ArtifactWrite {
  return {
    projectId: "project_1",
    artifactKey: "source_pdf",
    kind: "source_pdf",
    value: new Blob([value], { type: "application/pdf" }),
    mediaType: "application/pdf",
    createdAtMs: 1_700_000_000_000,
    regenerable: false,
    pinned: true,
    finalArtifact: false,
    expiresAtMs: null,
  };
}

function setup(databaseName: string) {
  const indexedDb = new IDBFactory();
  const state = new IndexedDbCheckpointRepository({
    indexedDb,
    keyRange: IDBKeyRange,
    databaseName,
  });
  const directory = new FakeDirectory();
  const artifacts = new OpfsArtifactStore({
    getRoot: async () => directory,
    subtle: webcrypto.subtle as SubtleCrypto,
  });
  return { state, directory, artifacts, persistence: new LocalProjectPersistence(state, artifacts, directLock) };
}
describe("LocalProjectPersistence", () => {
  it("writes and verifies OPFS before publishing resumable metadata", async () => {
    const { state, persistence } = setup("local-project-round-trip");

    const result = await persistence.persist(checkpoint(), [artifactWrite()]);
    expect(result.checkpoint.sequence).toBe(1);
    await expect(persistence.inspectResume("project_1")).resolves.toMatchObject({
      checkpoint: { sequence: 1 },
      unavailableArtifactKeys: [],
      resumable: true,
    });
    state.close();
  });

  it("allocates the next sequence under the project lock and reuses immutable artifact metadata", async () => {
    const { state, persistence } = setup("next-sequence");
    const first = checkpoint();
    const { sequence: _ignored, ...draft } = first;

    const one = await persistence.persistNext(draft, [artifactWrite()]);
    const two = await persistence.persistNext(
      { ...draft, createdAtMs: draft.createdAtMs + 100 },
      [{ ...artifactWrite(), createdAtMs: artifactWrite().createdAtMs + 100 }],
    );

    expect(one.checkpoint.sequence).toBe(1);
    expect(two.checkpoint.sequence).toBe(2);
    expect(two.artifacts[0].createdAtMs).toBe(one.artifacts[0].createdAtMs);
    state.close();
  });

  it("rejects a review checkpoint if the project changed after validation", async () => {
    const { state, persistence } = setup("review-checkpoint-race");
    const first = await persistence.persist(checkpoint(), [artifactWrite()]);
    const { sequence: _ignored, ...draft } = checkpoint();
    await persistence.persistNext({ ...draft, createdAtMs: 1_700_000_000_002 }, []);
    await expect(persistence.persistNext({ ...draft, createdAtMs: 1_700_000_000_003 }, [], first.checkpoint.checksum))
      .rejects.toMatchObject({ code: "CHECKPOINT_CHANGED" });
    await expect(persistence.loadLatest("project_1")).resolves.toMatchObject({ sequence: 2 });
    state.close();
  });

  it("does not publish a checkpoint when artifact persistence fails first", async () => {
    const indexedDb = new IDBFactory();
    const state = new IndexedDbCheckpointRepository({ indexedDb, keyRange: IDBKeyRange, databaseName: "failed-artifact" });
    const artifacts = {
      put: async () => { throw new Error("write failed"); },
      get: async () => new Blob(),
      delete: async () => undefined,
      listFileNames: async () => [],
      deleteFileName: async () => undefined,
    };
    const persistence = new LocalProjectPersistence(state, artifacts, directLock);

    await expect(persistence.persist(checkpoint(), [artifactWrite()])).rejects.toThrow("write failed");
    await expect(state.loadLatest("project_1")).resolves.toBeNull();
    state.close();
  });

  it("marks recovery unsafe when a referenced artifact is missing or corrupt", async () => {
    const { state, directory, persistence } = setup("resume-corruption");
    const result = await persistence.persist(checkpoint(), [artifactWrite()]);
    directory.files.set(result.artifacts[0].fileName, new Blob(["corrupted"]));

    await expect(persistence.inspectResume("project_1")).resolves.toMatchObject({
      checkpoint: { sequence: 1 },
      unavailableArtifactKeys: ["source_pdf"],
      resumable: false,
    });
    state.close();
  });

  it("reports orphan and missing managed files without deleting them", async () => {
    const { state, directory, persistence } = setup("reconcile");
    const result = await persistence.persist(checkpoint(), [artifactWrite()]);
    const known = result.artifacts[0].fileName;
    const orphan = `v1_${"c".repeat(64)}.bin`;
    directory.files.set(orphan, new Blob(["orphan"]));
    const first = await persistence.reconcileStorage();
    expect(first.orphanFileNames).toEqual([orphan]);
    expect(first.missingFileNames).toEqual([]);

    directory.files.delete(known);
    const second = await persistence.reconcileStorage();
    expect(second.missingFileNames).toEqual([known]);
    expect(directory.files.has(orphan)).toBe(true);
    state.close();
  });

  it("physically evicts only safe regenerable artifacts outside the current project", async () => {
    const { state, directory, persistence } = setup("physical-eviction");
    await persistence.persist(checkpoint(), [artifactWrite()]);

    const otherCheckpoint: CheckpointInput = {
      ...checkpoint(1),
      projectId: "project_2",
      artifactKeys: ["cache_chunk"],
    };
    const otherWrite: ArtifactWrite = {
      ...artifactWrite("cache bytes"),
      projectId: "project_2",
      artifactKey: "cache_chunk",
      kind: "audio_chunk",
      regenerable: true,
      pinned: false,
    };
    const other = await persistence.persist(otherCheckpoint, [otherWrite]);

    const removed = await persistence.cleanupRegenerableArtifacts(1, "project_1");
    expect(removed.map(record => record.artifactKey)).toEqual(["cache_chunk"]);
    expect(directory.files.has(other.artifacts[0].fileName)).toBe(false);
    await expect(state.listArtifacts("project_2")).resolves.toEqual([]);
    await expect(state.listArtifacts("project_1")).resolves.toHaveLength(1);
    state.close();
  });
});

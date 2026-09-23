import { webcrypto } from "node:crypto";
import { IDBFactory, IDBKeyRange, IDBObjectStore as FakeIDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import type { CheckpointInput } from "../schemas/persistence";
import { IndexedDbCheckpointRepository } from "./indexeddb_checkpoint_repository";
import { LocalProjectPersistence } from "./local_project_persistence";
import { OpfsArtifactStore } from "./opfs_artifact_store";
import type { ArtifactWrite, ProjectLock } from "./ports";

class FakeDirectory {
  readonly files = new Map<string, Blob>();
  readonly blockedDeletes = new Set<string>();

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
    if (this.blockedDeletes.has(name)) throw new DOMException("blocked", "NotAllowedError");
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
  return { indexedDb, state, directory, artifacts, persistence: new LocalProjectPersistence(state, artifacts, directLock) };
}

async function audioHistory(databaseName: string) {
  const environment = setup(databaseName);
  const { persistence } = environment;
  const baseKeys = ["source_pdf", "document_ir", "document_ir_v2"];
  const base = { ...checkpoint(), artifactKeys: baseKeys };
  const writes = [artifactWrite(), ...["document_ir", "document_ir_v2"].map(artifactKey => ({
    ...artifactWrite(`{\"key\":\"${artifactKey}\"}`), artifactKey, kind: "document_ir" as const,
    mediaType: "application/json", regenerable: true, pinned: false,
  }))];
  const first = await persistence.persist(base, writes);
  const oldKey = `literal_wav_${"a".repeat(32)}`;
  const newKey = `literal_wav_${"b".repeat(32)}`;
  const audioWrites = (key: string): ArtifactWrite[] => [
    { ...artifactWrite(`audio:${key}`), artifactKey: key, kind: "audio_chunk", mediaType: "audio/wav" },
    { ...artifactWrite(`meta:${key}`), artifactKey: `${key}_meta`, kind: "audio_metadata", mediaType: "application/json" },
  ];
  const { sequence: _sequence, ...draft } = base;
  const old = await persistence.persistNext({ ...draft, createdAtMs: base.createdAtMs + 1,
    artifactKeys: [...baseKeys, oldKey, `${oldKey}_meta`] }, audioWrites(oldKey), first.checkpoint.checksum);
  const latest = await persistence.persistNext({ ...draft, createdAtMs: base.createdAtMs + 2,
    artifactKeys: [...baseKeys, newKey, `${newKey}_meta`] }, audioWrites(newKey), old.checkpoint.checksum);
  return { ...environment, base, first, old, latest, oldKey, newKey };
}
describe("LocalProjectPersistence", () => {
  it("compacts one historical literal WAV and preserves current and fallback checkpoints", async () => {
    const { state, directory, persistence, old, oldKey, latest } = await audioHistory("literal-compaction");
    const oldFiles = old.artifacts.map(record => record.fileName);
    const result = await persistence.compactHistoricalLiteralAudio("project_1", latest.checkpoint.sourceHash!, oldKey);
    expect(result).toMatchObject({ removedCheckpoints: 1, pendingFiles: 0 });
    expect(result.reclaimedBytes).toBe(old.artifacts.reduce((size, record) => size + record.sizeBytes, 0));
    expect((await state.listCheckpoints("project_1")).map(record => record.sequence)).toEqual([1, 3]);
    expect((await state.listArtifacts("project_1")).some(record => record.artifactKey === oldKey)).toBe(false);
    expect(oldFiles.every(fileName => !directory.files.has(fileName))).toBe(true);
    await expect(persistence.inspectResume("project_1")).resolves.toMatchObject({ resumable: true, checkpoint: { sequence: 3 } });
    state.close();
  });

  it("refuses current WAV and unsafe recovery without deleting data", async () => {
    const { state, directory, persistence, oldKey, newKey, latest } = await audioHistory("literal-guards");
    await expect(persistence.compactHistoricalLiteralAudio("project_1", latest.checkpoint.sourceHash!, newKey))
      .rejects.toMatchObject({ code: "NOT_HISTORICAL" });
    await expect(persistence.compactHistoricalLiteralAudio("project_1", `sha256:${"f".repeat(64)}`, oldKey))
      .rejects.toMatchObject({ code: "CHECKPOINT_CHANGED" });
    const source = (await state.listArtifacts("project_1")).find(record => record.artifactKey === "source_pdf")!;
    directory.files.set(source.fileName, new Blob(["corrupt"]));
    await expect(persistence.compactHistoricalLiteralAudio("project_1", latest.checkpoint.sourceHash!, oldKey))
      .rejects.toMatchObject({ code: "RECOVERY_UNSAFE" });
    expect((await state.listCheckpoints("project_1")).map(record => record.sequence)).toEqual([1, 2, 3]);
    state.close();
  });

  it("persists OPFS deletion intent and retries after a file-removal failure", async () => {
    const { indexedDb, state, directory, artifacts, persistence, old, oldKey, latest } = await audioHistory("literal-delete-retry");
    const oldFile = old.artifacts[0].fileName;
    directory.blockedDeletes.add(oldFile);
    const first = await persistence.compactHistoricalLiteralAudio("project_1", latest.checkpoint.sourceHash!, oldKey);
    expect(first.pendingFiles).toBe(1);
    expect(directory.files.has(oldFile)).toBe(true);
    expect((await state.listCheckpoints("project_1")).map(record => record.sequence)).toEqual([1, 3]);
    state.close();
    const reopened = new IndexedDbCheckpointRepository({ indexedDb, keyRange: IDBKeyRange, databaseName: "literal-delete-retry" });
    const recovered = new LocalProjectPersistence(reopened, artifacts, directLock);
    directory.blockedDeletes.delete(oldFile);
    await expect(recovered.resumePendingFileDeletions("project_1")).resolves.toMatchObject({ pendingFiles: 0 });
    expect(directory.files.has(oldFile)).toBe(false);
    reopened.close();
  });

  it("rejects compaction if a checkpoint appears after preflight", async () => {
    const { state, persistence, oldKey, latest } = await audioHistory("literal-compaction-race");
    const original = state.compactHistoricalAudio.bind(state);
    state.compactHistoricalAudio = async input => {
      await state.save({ ...checkpoint(4), artifactKeys: latest.checkpoint.artifactKeys });
      await original(input);
    };
    await expect(persistence.compactHistoricalLiteralAudio("project_1", latest.checkpoint.sourceHash!, oldKey))
      .rejects.toMatchObject({ code: "COMPACTION_CONFLICT" });
    expect((await state.listCheckpoints("project_1")).map(record => record.sequence)).toEqual([1, 2, 3, 4]);
    expect((await state.listArtifacts("project_1")).some(record => record.artifactKey === oldKey)).toBe(true);
    state.close();
  });

  it("rolls back checkpoint and manifest deletion if the pending-intent write fails", async () => {
    const { state, persistence, oldKey, latest } = await audioHistory("literal-atomic-abort");
    const realPut = FakeIDBObjectStore.prototype.put;
    const spy = vi.spyOn(FakeIDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === "pending_file_deletions") throw new DOMException("quota", "QuotaExceededError");
      return Reflect.apply(realPut, this, args);
    });
    try {
      await expect(persistence.compactHistoricalLiteralAudio("project_1", latest.checkpoint.sourceHash!, oldKey))
        .rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    } finally {
      spy.mockRestore();
    }
    expect((await state.listCheckpoints("project_1")).map(record => record.sequence)).toEqual([1, 2, 3]);
    expect((await state.listArtifacts("project_1")).some(record => record.artifactKey === oldKey)).toBe(true);
    await expect(state.listPendingFileDeletions("project_1")).resolves.toEqual([]);
    state.close();
  });

  it("keeps historical audio when no independent fallback checkpoint exists", async () => {
    const { state, persistence } = setup("literal-no-fallback");
    const oldKey = `literal_wav_${"c".repeat(32)}`;
    const newKey = `literal_wav_${"d".repeat(32)}`;
    const base = checkpoint();
    const old = await persistence.persist({ ...base, artifactKeys: ["source_pdf", oldKey, `${oldKey}_meta`] }, [
      artifactWrite(),
      { ...artifactWrite("old audio"), artifactKey: oldKey, kind: "audio_chunk", mediaType: "audio/wav" },
      { ...artifactWrite("old meta"), artifactKey: `${oldKey}_meta`, kind: "audio_metadata", mediaType: "application/json" },
    ]);
    const { sequence: _sequence, ...draft } = base;
    const latest = await persistence.persistNext({ ...draft, artifactKeys: ["source_pdf", newKey, `${newKey}_meta`],
      createdAtMs: base.createdAtMs + 1 }, [
      { ...artifactWrite("new audio"), artifactKey: newKey, kind: "audio_chunk", mediaType: "audio/wav" },
      { ...artifactWrite("new meta"), artifactKey: `${newKey}_meta`, kind: "audio_metadata", mediaType: "application/json" },
    ], old.checkpoint.checksum);
    await expect(persistence.compactHistoricalLiteralAudio("project_1", latest.checkpoint.sourceHash!, oldKey))
      .rejects.toMatchObject({ code: "RECOVERY_UNSAFE" });
    expect((await state.listCheckpoints("project_1")).map(record => record.sequence)).toEqual([1, 2]);
    state.close();
  });
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

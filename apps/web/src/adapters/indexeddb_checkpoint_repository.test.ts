import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { CheckpointInput } from "../schemas/persistence";
import { IndexedDbCheckpointRepository } from "./indexeddb_checkpoint_repository";

function checkpoint(sequence: number, state: CheckpointInput["job"]["state"] = "EXTRACTING", projectId = "project_1"): CheckpointInput {
  return {
    schemaVersion: 1,
    projectId,
    sequence,
    createdAtMs: 1_700_000_000_000 + sequence,
    pipelineVersion: "m3.1",
    sourceHash: `sha256:${"a".repeat(64)}`,
    job: { state, resumeState: null },
    artifactKeys: ["source_pdf"],
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putRaw(indexedDb: IDBFactory, databaseName: string, value: unknown): Promise<void> {
  await putRawMany(indexedDb, databaseName, [value]);
}

async function putRawMany(indexedDb: IDBFactory, databaseName: string, values: unknown[]): Promise<void> {
  const database = await requestResult(indexedDb.open(databaseName, 1));
  const transaction = database.transaction("checkpoints", "readwrite");
  const completed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
  const store = transaction.objectStore("checkpoints");
  values.forEach(value => store.put(value));
  await completed;
  database.close();
}

function repository(indexedDb: IDBFactory, databaseName: string, maxRecoveryCandidates?: number): IndexedDbCheckpointRepository {
  return new IndexedDbCheckpointRepository({ indexedDb, keyRange: IDBKeyRange, databaseName, maxRecoveryCandidates });
}

describe("IndexedDB checkpoint repository", () => {
  it("round-trips checkpoints and restores the highest sequence", async () => {
    const indexedDb = new IDBFactory();
    const store = repository(indexedDb, "round-trip");
    await store.save(checkpoint(1));
    const expected = await store.save(checkpoint(2, "STRUCTURING"));
    await store.save(checkpoint(99, "PACKAGING", "project_2"));
    await expect(store.loadLatest("project_1")).resolves.toEqual(expected);
    store.close();
  });

  it("makes repeated writes idempotent and rejects conflicting writers", async () => {
    const indexedDb = new IDBFactory();
    const store = repository(indexedDb, "overwrite");
    const original = await store.save(checkpoint(1));
    await expect(store.save(checkpoint(1))).resolves.toEqual(original);
    await expect(store.save(checkpoint(1, "STRUCTURING"))).rejects.toMatchObject({ code: "CHECKPOINT_CONFLICT" });
    await expect(store.loadLatest("project_1")).resolves.toEqual(original);
    await store.delete("project_1", 1);
    await expect(store.loadLatest("project_1")).resolves.toBeNull();
    store.close();
  });

  it("rejects unsupported and corrupt stored records without deleting them", async () => {
    const indexedDb = new IDBFactory();
    const databaseName = "corruption";
    const store = repository(indexedDb, databaseName);
    const valid = await store.save(checkpoint(1));

    await putRaw(indexedDb, databaseName, { ...valid, schemaVersion: 2, sequence: 2 });
    await expect(store.loadLatest("project_1")).rejects.toMatchObject({ code: "UNSUPPORTED_SCHEMA" });

    await putRaw(indexedDb, databaseName, { ...valid, schemaVersion: 1, sequence: 3, checksum: "invalid" });
    await expect(store.loadLatest("project_1")).rejects.toMatchObject({ code: "CORRUPT_RECORD" });
    await expect(store.recoverLatest("project_1")).resolves.toEqual({
      checkpoint: valid,
      rejected: [
        { sequence: 3, code: "CORRUPT_RECORD" },
        { sequence: 2, code: "UNSUPPORTED_SCHEMA" },
      ],
    });
    store.close();
  });

  it("detects a valid-looking record changed after checksum generation", async () => {
    const indexedDb = new IDBFactory();
    const databaseName = "checksum";
    const store = repository(indexedDb, databaseName);
    const valid = await store.save(checkpoint(1));
    await putRaw(indexedDb, databaseName, { ...valid, sequence: 2 });
    await expect(store.loadLatest("project_1")).rejects.toMatchObject({ code: "CHECKSUM_MISMATCH" });
    store.close();
  });

  it("keeps the last valid checkpoint when a replacement fails validation", async () => {
    const indexedDb = new IDBFactory();
    const store = repository(indexedDb, "failed-replacement");
    const valid = await store.save(checkpoint(1));
    await expect(store.save({ ...checkpoint(1), artifactKeys: ["duplicate", "duplicate"] })).rejects.toBeTruthy();
    await expect(store.loadLatest("project_1")).resolves.toEqual(valid);
    store.close();
  });

  it("restores a recent valid checkpoint without scanning an unbounded history", async () => {
    const indexedDb = new IDBFactory();
    const databaseName = "bounded-recovery";
    const store = repository(indexedDb, databaseName, 3);
    const recent = await store.save(checkpoint(4));
    await putRawMany(indexedDb, databaseName, Array.from({ length: 3 }, (_, index) => ({
      ...recent,
      schemaVersion: 2,
      sequence: index + 1,
    })));
    await expect(store.recoverLatest("project_1")).resolves.toEqual({ checkpoint: recent, rejected: [] });
    store.close();
  });

  it("retries opening the database after a transient failure", async () => {
    const indexedDb = new IDBFactory();
    let attempts = 0;
    const flakyFactory = {
      open: (name: string, version?: number) => {
        attempts += 1;
        if (attempts === 1) throw new Error("transient open failure");
        return indexedDb.open(name, version);
      },
    } as IDBFactory;
    const store = repository(flakyFactory, "retry-open");
    await expect(store.save(checkpoint(1))).rejects.toMatchObject({ code: "OPEN_FAILED" });
    await expect(store.save(checkpoint(1))).resolves.toMatchObject({ sequence: 1 });
    expect(attempts).toBe(2);
    store.close();
  });
});

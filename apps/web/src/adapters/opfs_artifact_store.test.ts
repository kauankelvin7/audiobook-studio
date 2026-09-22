import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ArtifactWrite } from "./ports";
import { ArtifactStorageError, OpfsArtifactStore } from "./opfs_artifact_store";

class FakeDirectory {
  readonly files = new Map<string, Blob>();
  failWrite = false;

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name) && !options?.create) throw new DOMException("missing", "NotFoundError");
    if (!this.files.has(name)) this.files.set(name, new Blob([]));
    return {
      getFile: async () => this.files.get(name)!,
      createWritable: async () => ({
        write: async (value: Blob) => {
          if (this.failWrite) throw new Error("disk failure");
          this.files.set(name, value);
        },
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

const subtle = webcrypto.subtle as SubtleCrypto;

function artifact(value = "binary payload"): ArtifactWrite {
  return {
    projectId: "project_1",
    artifactKey: "source_pdf",
    kind: "source_pdf",
    value: new Blob([value], { type: "application/pdf" }),
    mediaType: "application/pdf",
    createdAtMs: 10,
    regenerable: false,
    pinned: true,
    finalArtifact: false,
    expiresAtMs: null,
  };
}

describe("OpfsArtifactStore", () => {
  it("writes, verifies and reads an immutable artifact", async () => {
    const directory = new FakeDirectory();
    const store = new OpfsArtifactStore({ getRoot: async () => directory, subtle });

    const record = await store.put(artifact());
    expect(record.fileName).toMatch(/^v1_[0-9a-f]{64}\.bin$/);
    expect(record.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    await expect((await store.get(record)).text()).resolves.toBe("binary payload");
  });

  it("is idempotent for the same identity and content", async () => {
    const directory = new FakeDirectory();
    const store = new OpfsArtifactStore({ getRoot: async () => directory, subtle });
    const first = await store.put(artifact());
    const second = await store.put(artifact());

    expect(second).toEqual(first);
    expect(directory.files.size).toBe(1);
  });

  it("detects corruption instead of overwriting it", async () => {
    const directory = new FakeDirectory();
    const store = new OpfsArtifactStore({ getRoot: async () => directory, subtle });
    const record = await store.put(artifact());
    directory.files.set(record.fileName, new Blob(["tampered"]));

    await expect(store.put(artifact())).rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
    await expect(store.get(record)).rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
  });

  it("removes a partial file when writing fails", async () => {
    const directory = new FakeDirectory();
    directory.failWrite = true;
    const store = new OpfsArtifactStore({ getRoot: async () => directory, subtle });

    await expect(store.put(artifact())).rejects.toMatchObject({ code: "WRITE_FAILED" });
    expect(directory.files.size).toBe(0);
  });

  it("rejects empty files and treats deletion as idempotent", async () => {
    const directory = new FakeDirectory();
    const store = new OpfsArtifactStore({ getRoot: async () => directory, subtle });
    await expect(store.put(artifact(""))).rejects.toMatchObject({ code: "EMPTY_ARTIFACT" });

    const record = await store.put(artifact());
    await store.delete(record);
    await expect(store.delete(record)).resolves.toBeUndefined();
  });

  it("lists only managed artifact files and rejects unsafe direct deletion", async () => {
    const directory = new FakeDirectory();
    const store = new OpfsArtifactStore({ getRoot: async () => directory, subtle });
    const record = await store.put(artifact());
    directory.files.set("foreign.tmp", new Blob(["ignore me"]));

    await expect(store.listFileNames()).resolves.toEqual([record.fileName]);
    await expect(store.deleteFileName("../escape.bin")).rejects.toBeTruthy();
    await expect(store.get(record)).resolves.toBeInstanceOf(Blob);
  });

  it("reports missing platform capabilities", () => {
    expect(() => new OpfsArtifactStore({ getRoot: undefined, subtle: undefined })).toThrow(ArtifactStorageError);
  });
});

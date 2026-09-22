import {
  artifactFileNameSchema,
  artifactManifestRecordSchema,
  storageIdSchema,
  type ArtifactManifestRecord,
} from "../schemas/persistence";
import type { ArtifactMaintenanceStore, ArtifactWrite } from "./ports";

type WritableFileLike = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
};

type FileHandleLike = {
  createWritable(): Promise<WritableFileLike>;
  getFile(): Promise<Blob>;
};

type DirectoryHandleLike = {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  keys(): AsyncIterableIterator<string>;
};

export type OpfsArtifactStoreOptions = {
  getRoot?: () => Promise<DirectoryHandleLike>;
  subtle?: SubtleCrypto;
};

export type ArtifactStorageErrorCode =
  | "OPFS_UNAVAILABLE"
  | "INVALID_ARTIFACT"
  | "EMPTY_ARTIFACT"
  | "HASH_FAILED"
  | "WRITE_FAILED"
  | "READ_FAILED"
  | "INTEGRITY_MISMATCH"
  | "DELETE_FAILED";

export class ArtifactStorageError extends Error {
  constructor(public readonly code: ArtifactStorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ArtifactStorageError";
  }
}

function isDomError(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === name;
}

export class OpfsArtifactStore implements ArtifactMaintenanceStore {
  private readonly getRoot: () => Promise<DirectoryHandleLike>;
  private readonly subtle: SubtleCrypto;

  constructor(options: OpfsArtifactStoreOptions = {}) {
    const storage = globalThis.navigator?.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> } | undefined;
    const getDirectory = storage?.getDirectory?.bind(storage);
    const getRoot = options.getRoot ?? (getDirectory as (() => Promise<DirectoryHandleLike>) | undefined);
    const subtle = options.subtle ?? globalThis.crypto?.subtle;
    if (!getRoot || !subtle) {
      throw new ArtifactStorageError("OPFS_UNAVAILABLE", "OPFS ou Web Crypto não está disponível neste ambiente.");
    }
    this.getRoot = getRoot;
    this.subtle = subtle;
  }

  async put(input: ArtifactWrite): Promise<ArtifactManifestRecord> {
    const projectId = storageIdSchema.parse(input.projectId);
    const artifactKey = storageIdSchema.parse(input.artifactKey);
    if (!(input.value instanceof Blob)) throw new ArtifactStorageError("INVALID_ARTIFACT", "O artefato precisa ser um Blob.");
    if (input.value.size === 0) throw new ArtifactStorageError("EMPTY_ARTIFACT", "Artefatos vazios não são persistidos.");

    const contentHash = await this.hash(await input.value.arrayBuffer());
    const fileName = await this.fileName(projectId, artifactKey, contentHash);
    const record = artifactManifestRecordSchema.parse({
      schemaVersion: 1,
      projectId,
      artifactKey,
      kind: input.kind,
      contentHash,
      fileName,
      mediaType: input.mediaType,
      sizeBytes: input.value.size,
      createdAtMs: input.createdAtMs,
      lastAccessedAtMs: input.createdAtMs,
      regenerable: input.regenerable,
      pinned: input.pinned,
      finalArtifact: input.finalArtifact,
      expiresAtMs: input.expiresAtMs,
    });

    let root: DirectoryHandleLike;
    try {
      root = await this.getRoot();
      const existing = await this.tryExisting(root, fileName);
      if (existing) {
        await this.verify(existing, record);
        return record;
      }
    } catch (error) {
      if (error instanceof ArtifactStorageError) throw error;
      throw new ArtifactStorageError("WRITE_FAILED", "Não foi possível acessar o armazenamento de artefatos.", { cause: error });
    }

    let writable: WritableFileLike | null = null;
    try {
      const handle = await root.getFileHandle(fileName, { create: true });
      writable = await handle.createWritable();
      await writable.write(input.value);
      await writable.close();
      writable = null;
      await this.verify(handle, record);
      return record;
    } catch (error) {
      if (writable?.abort) await writable.abort().catch(() => undefined);
      await root.removeEntry(fileName).catch(() => undefined);
      if (error instanceof ArtifactStorageError) throw error;
      throw new ArtifactStorageError("WRITE_FAILED", "A escrita do artefato no OPFS falhou.", { cause: error });
    }
  }

  async get(recordInput: ArtifactManifestRecord): Promise<Blob> {
    const record = artifactManifestRecordSchema.parse(recordInput);
    try {
      const root = await this.getRoot();
      const handle = await root.getFileHandle(record.fileName);
      const file = await handle.getFile();
      await this.verifyBlob(file, record);
      return file;
    } catch (error) {
      if (error instanceof ArtifactStorageError) throw error;
      throw new ArtifactStorageError("READ_FAILED", "Não foi possível ler o artefato do OPFS.", { cause: error });
    }
  }

  async delete(recordInput: ArtifactManifestRecord): Promise<void> {
    const record = artifactManifestRecordSchema.parse(recordInput);
    await this.deleteFileName(record.fileName);
  }

  async listFileNames(): Promise<string[]> {
    try {
      const root = await this.getRoot();
      const names: string[] = [];
      for await (const name of root.keys()) {
        if (artifactFileNameSchema.safeParse(name).success) names.push(name);
      }
      return names.sort();
    } catch (error) {
      throw new ArtifactStorageError("READ_FAILED", "Não foi possível listar os artefatos do OPFS.", { cause: error });
    }
  }

  async deleteFileName(fileNameInput: string): Promise<void> {
    const fileName = artifactFileNameSchema.parse(fileNameInput);
    try {
      const root = await this.getRoot();
      await root.removeEntry(fileName);
    } catch (error) {
      if (isDomError(error, "NotFoundError")) return;
      throw new ArtifactStorageError("DELETE_FAILED", "Não foi possível remover o artefato do OPFS.", { cause: error });
    }
  }

  private async tryExisting(root: DirectoryHandleLike, fileName: string): Promise<FileHandleLike | null> {
    try {
      return await root.getFileHandle(fileName);
    } catch (error) {
      if (isDomError(error, "NotFoundError")) return null;
      throw error;
    }
  }

  private async verify(handle: FileHandleLike, record: ArtifactManifestRecord): Promise<void> {
    let file: Blob;
    try {
      file = await handle.getFile();
    } catch (error) {
      throw new ArtifactStorageError("READ_FAILED", "O artefato escrito não pôde ser relido.", { cause: error });
    }
    await this.verifyBlob(file, record);
  }

  private async verifyBlob(file: Blob, record: ArtifactManifestRecord): Promise<void> {
    if (file.size !== record.sizeBytes || await this.hash(await file.arrayBuffer()) !== record.contentHash) {
      throw new ArtifactStorageError("INTEGRITY_MISMATCH", "O artefato persistido não confere com seu manifest.");
    }
  }

  private async fileName(projectId: string, artifactKey: string, contentHash: string): Promise<string> {
    const identity = new TextEncoder().encode(`${projectId}\u0000${artifactKey}\u0000${contentHash}`);
    return `v1_${(await this.hash(identity.buffer)).slice("sha256:".length)}.bin`;
  }

  private async hash(bytes: ArrayBuffer): Promise<string> {
    try {
      const digest = await this.subtle.digest("SHA-256", bytes);
      const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      return `sha256:${hex}`;
    } catch (error) {
      throw new ArtifactStorageError("HASH_FAILED", "Não foi possível calcular o hash do artefato.", { cause: error });
    }
  }
}

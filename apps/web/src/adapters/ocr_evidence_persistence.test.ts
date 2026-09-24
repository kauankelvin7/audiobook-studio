import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import documentFixture from "../../../../tests/fixtures/document_ir_v2.json";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { documentIrV2Schema } from "../schemas/ingestion";
import { IndexedDbCheckpointRepository } from "./indexeddb_checkpoint_repository";
import type { LocalOcrCandidateResult } from "./local_ocr_candidate";
import { LocalProjectPersistence } from "./local_project_persistence";
import { OcrEvidencePersistence } from "./ocr_evidence_persistence";
import { OpfsArtifactStore } from "./opfs_artifact_store";
import type { ProjectLock } from "./ports";
import { buildOcrCandidateReceipt } from "./rust_ocr_candidate";

initSync({ module: readFileSync(fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url))) });

const document = documentIrV2Schema.parse(documentFixture);
const region = document.pages[0].regions[0];
const png = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=", "base64")], { type: "image/png" });
const hash = (value: string | Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const lock: ProjectLock = { runExclusive: async (_projectId, operation) => await operation() };

async function candidate(): Promise<LocalOcrCandidateResult> {
  const crop = {
    schemaVersion: 1 as const, documentId: document.documentId, sourceHash: document.sourceHash,
    pageNumber: 1, regionId: region.id, nativeTextHash: hash(region.sources.rawText!),
    imageHash: hash(new Uint8Array(await png.arrayBuffer())), image: png,
    bbox: region.bbox! as [number, number, number, number], pixelWidth: 1, pixelHeight: 1,
    renderScale: 2, methodVersion: "pdfjs-region-crop-v1" as const,
  };
  const value = {
    schemaVersion: 1 as const, documentId: crop.documentId, sourceHash: crop.sourceHash,
    pageNumber: crop.pageNumber, regionId: crop.regionId, nativeTextHash: crop.nativeTextHash,
    imageHash: crop.imageHash, engineId: "fixture", engineVersion: "1", text: "RECOVERED CODE",
  };
  return { crop, candidate: value, receipt: await buildOcrCandidateReceipt(document, value) };
}

function setup(name: string) {
  const state = new IndexedDbCheckpointRepository({ indexedDb: new IDBFactory(), keyRange: IDBKeyRange, databaseName: name });
  const files = new Map<string, Blob>();
  const artifacts = new OpfsArtifactStore({
    subtle: webcrypto.subtle as SubtleCrypto,
    getRoot: async () => ({
      getFileHandle: async (fileName: string, options?: { create?: boolean }) => {
        if (!files.has(fileName) && !options?.create) throw new DOMException("missing", "NotFoundError");
        if (!files.has(fileName)) files.set(fileName, new Blob());
        return {
          getFile: async () => files.get(fileName)!,
          createWritable: async () => ({ write: async (value: Blob) => { files.set(fileName, value); }, close: async () => undefined }),
        };
      },
      removeEntry: async (fileName: string) => { files.delete(fileName); },
      keys: async function* () { yield* files.keys(); },
    }),
  });
  const persistence = new LocalProjectPersistence(state, artifacts, lock);
  return { state, files, persistence, evidence: new OcrEvidencePersistence(persistence) };
}

async function initial(persistence: LocalProjectPersistence) {
  await persistence.persist({ schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
    pipelineVersion: "m4", sourceHash: document.sourceHash,
    job: { state: "VERIFYING", resumeState: null }, artifactKeys: [] }, []);
}

describe("historical OCR evidence persistence", () => {
  it("stores both fixed artifacts, rechecks the real Rust receipt, and survives source change", async () => {
    const { state, persistence, evidence } = setup("ocr-evidence-roundtrip");
    await initial(persistence);
    const saved = await evidence.save("project_1", document, await candidate());
    const sequence = (await persistence.loadLatest("project_1"))!.sequence;
    const retried = await evidence.save("project_1", document, await candidate());
    expect(retried.recordArtifact).toEqual(saved.recordArtifact);
    expect((await persistence.loadLatest("project_1"))!.sequence).toBe(sequence);
    expect(saved.imageArtifact).toMatchObject({ kind: "ocr_evidence", pinned: true, regenerable: false });
    expect(saved.recordArtifact).toMatchObject({ kind: "ocr_evidence", pinned: true, regenerable: false });
    expect(saved.receipt.status).toBe("pending");
    expect((await evidence.readHistorical("project_1", document, saved.imageArtifact, saved.recordArtifact)).receipt)
      .toEqual(saved.receipt);
    const latest = await persistence.loadLatest("project_1");
    await persistence.persistNext({ schemaVersion: 1, projectId: "project_1", createdAtMs: 3,
      pipelineVersion: "m4", sourceHash: hash("other"), job: latest!.job, artifactKeys: [] }, [], latest!.checksum);
    await expect(evidence.readHistorical("project_1", document, saved.imageArtifact, saved.recordArtifact))
      .resolves.toMatchObject({ currentness: "not_established" });
    state.close();
  }, 20_000);

  it("rejects stale source and altered image or metadata", async () => {
    const { state, files, persistence, evidence } = setup("ocr-evidence-corrupt");
    await initial(persistence);
    const input = await candidate();
    await expect(evidence.save("project_1", document, { ...input, crop: { ...input.crop, imageHash: hash("wrong") } }))
      .rejects.toMatchObject({ code: "INVALID_EVIDENCE" });
    const saved = await evidence.save("project_1", document, input);
    await expect(evidence.readHistorical("project_1", document,
      saved.imageArtifact, { ...saved.recordArtifact, lastAccessedAtMs: saved.recordArtifact.lastAccessedAtMs + 1 }))
      .rejects.toMatchObject({ code: "WRONG_ARTIFACT" });
    await expect(evidence.readHistorical("project_1", document, { ...saved.imageArtifact, sizeBytes: 5 }, saved.recordArtifact))
      .rejects.toMatchObject({ code: "WRONG_ARTIFACT" });
    files.set(saved.imageArtifact.fileName, new Blob(["corrupt"]));
    await expect(evidence.readHistorical("project_1", document, saved.imageArtifact, saved.recordArtifact))
      .rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
    state.close();
  });

  it("rejects saving after source change and detects checkpoint races on historical read", async () => {
    const { state, persistence, evidence } = setup("ocr-evidence-race");
    await initial(persistence);
    const saved = await evidence.save("project_1", document, await candidate());
    const originalLoad = persistence.loadLatest.bind(persistence);
    let reads = 0;
    persistence.loadLatest = async projectId => {
      reads += 1;
      if (reads === 2) {
        const latest = await originalLoad(projectId);
        await persistence.persistNext({ schemaVersion: 1, projectId, createdAtMs: latest!.createdAtMs + 1,
          pipelineVersion: latest!.pipelineVersion, sourceHash: hash("other"), job: latest!.job,
          artifactKeys: [] }, [], latest!.checksum);
      }
      return await originalLoad(projectId);
    };
    await expect(evidence.readHistorical("project_1", document, saved.imageArtifact, saved.recordArtifact))
      .rejects.toMatchObject({ code: "CHECKPOINT_CHANGED" });
    persistence.loadLatest = originalLoad;
    await expect(evidence.save("project_1", document, await candidate()))
      .rejects.toMatchObject({ code: "SOURCE_CHANGED" });
    state.close();
  });

  it("does not present orphaned OCR manifests as project history", async () => {
    const { state, persistence, evidence } = setup("ocr-evidence-orphan");
    await initial(persistence);
    const saved = await evidence.save("project_1", document, await candidate());
    const checkpoints = await state.listCheckpoints("project_1");
    for (const checkpoint of checkpoints) await state.delete("project_1", checkpoint.sequence);
    await expect(evidence.readHistorical("project_1", document, saved.imageArtifact, saved.recordArtifact))
      .rejects.toMatchObject({ code: "NO_PROJECT" });
    state.close();
  });

  it("rejects a truncated PNG even when its declared hash and Rust receipt match", async () => {
    const { state, persistence, evidence } = setup("ocr-evidence-truncated-png");
    await initial(persistence);
    const input = await candidate();
    const image = png.slice(0, png.size - 12, "image/png");
    const imageHash = hash(new Uint8Array(await image.arrayBuffer()));
    const forged = {
      crop: { ...input.crop, image, imageHash },
      candidate: { ...input.candidate, imageHash },
      receipt: await buildOcrCandidateReceipt(document, { ...input.candidate, imageHash }),
    };
    await expect(evidence.save("project_1", document, forged)).rejects.toMatchObject({ code: "INVALID_EVIDENCE" });
    state.close();
  });

  it("rejects an idempotent retry if the source changes before its final check", async () => {
    const { state, persistence, evidence } = setup("ocr-evidence-retry-race");
    await initial(persistence);
    await evidence.save("project_1", document, await candidate());
    const originalLoad = persistence.loadLatest.bind(persistence);
    let reads = 0;
    persistence.loadLatest = async projectId => {
      reads += 1;
      if (reads === 4) {
        const latest = await originalLoad(projectId);
        await persistence.persistNext({ schemaVersion: 1, projectId, createdAtMs: latest!.createdAtMs + 1,
          pipelineVersion: latest!.pipelineVersion, sourceHash: hash("other"), job: latest!.job,
          artifactKeys: [] }, [], latest!.checksum);
      }
      return await originalLoad(projectId);
    };
    await expect(evidence.save("project_1", document, await candidate()))
      .rejects.toMatchObject({ code: "CHECKPOINT_CHANGED" });
    state.close();
  });
});

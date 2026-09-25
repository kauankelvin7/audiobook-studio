import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import documentFixture from "../../../../tests/fixtures/document_ir_v2.json";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { documentIrV2Schema } from "../schemas/ingestion";
import { saveApprovedOcr } from "./canonical_ocr";
import { loadApprovedOcrComposition, saveApprovedOcrComposition } from "./canonical_ocr_batch";
import { IndexedDbCheckpointRepository } from "./indexeddb_checkpoint_repository";
import { LocalProjectPersistence } from "./local_project_persistence";
import { OcrEvidencePersistence } from "./ocr_evidence_persistence";
import { OcrReviewPersistence } from "./ocr_review_persistence";
import { OpfsArtifactStore } from "./opfs_artifact_store";
import type { ProjectLock } from "./ports";
import { buildOcrCandidateReceipt } from "./rust_ocr_candidate";

initSync({ module: readFileSync(fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url))) });

const hash = (value: string | Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const document = documentIrV2Schema.parse({ ...documentFixture, pages: [{ ...documentFixture.pages[0],
  regions: [documentFixture.pages[0].regions[0], { ...documentFixture.pages[0].regions[0], id: "r_1_2" }] }] });
const png = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=", "base64")], { type: "image/png" });
let lockTail = Promise.resolve();
const lock: ProjectLock = { runExclusive: async (_projectId, operation) => {
  const previous = lockTail;
  let release: () => void = () => {};
  lockTail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await operation(); } finally { release(); }
} };

function setup(name: string) {
  const state = new IndexedDbCheckpointRepository({ indexedDb: new IDBFactory(), keyRange: IDBKeyRange, databaseName: name });
  const files = new Map<string, Blob>();
  const artifacts = new OpfsArtifactStore({ subtle: webcrypto.subtle as SubtleCrypto,
    getRoot: async () => ({
      getFileHandle: async (fileName: string, options?: { create?: boolean }) => {
        if (!files.has(fileName) && !options?.create) throw new DOMException("missing", "NotFoundError");
        if (!files.has(fileName)) files.set(fileName, new Blob());
        return { getFile: async () => files.get(fileName)!,
          createWritable: async () => ({ write: async (value: Blob) => { files.set(fileName, value); }, close: async () => undefined }) };
      },
      removeEntry: async (fileName: string) => { files.delete(fileName); },
      keys: async function* () { yield* files.keys(); },
    }),
  });
  const persistence = new LocalProjectPersistence(state, artifacts, lock);
  return { state, files, persistence, evidence: new OcrEvidencePersistence(persistence), review: new OcrReviewPersistence(persistence) };
}

async function approved(services: ReturnType<typeof setup>, regionId: string) {
  const region = document.pages[0].regions.find(item => item.id === regionId)!;
  const crop = { schemaVersion: 1 as const, documentId: document.documentId, sourceHash: document.sourceHash,
    pageNumber: 1, regionId, nativeTextHash: hash(region.sources.rawText!), imageHash: hash(new Uint8Array(await png.arrayBuffer())),
    image: png, bbox: region.bbox! as [number, number, number, number], pixelWidth: 1, pixelHeight: 1,
    renderScale: 2, methodVersion: "pdfjs-region-crop-v1" as const };
  const candidate = { schemaVersion: 1 as const, documentId: crop.documentId, sourceHash: crop.sourceHash,
    pageNumber: 1, regionId, nativeTextHash: crop.nativeTextHash, imageHash: crop.imageHash,
    engineId: "fixture", engineVersion: "1", text: `OCR ${regionId}` };
  const evidence = await services.evidence.save(document.documentId, document,
    { crop, candidate, receipt: await buildOcrCandidateReceipt(document, candidate) });
  const review = await services.review.save(document.documentId, document, evidence.imageArtifact, evidence.recordArtifact,
    { schemaVersion: 1, receiptHash: evidence.receipt.receiptHash, disposition: "propose_correction",
      rationale: "Conferido com a imagem original.", proposedText: `Texto aprovado ${regionId}` });
  const canonical = await saveApprovedOcr(services.persistence, document, review);
  return `canonical_ocr_${canonical.promotion.reviewHash.slice(7)}`;
}

describe("OCR composition persistence with real WASM", () => {
  it("saves, reloads and retries a selected set, then rejects corrupted bytes", async () => {
    const services = setup("ocr-batch-roundtrip");
    const projectId = document.documentId;
    await services.persistence.persist({ schemaVersion: 1, projectId, sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4", sourceHash: document.sourceHash, job: { state: "VERIFYING", resumeState: null },
      artifactKeys: ["document_ir_v2"] }, [{ projectId, artifactKey: "document_ir_v2", kind: "model",
      mediaType: "application/json", value: new Blob([JSON.stringify(document)], { type: "application/json" }),
      createdAtMs: 1, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null }]);
    const first = await approved(services, "r_1_1");
    const second = await approved(services, "r_1_2");
    const before = (await services.persistence.loadLatest(projectId))!.sequence;
    const [saved, concurrent] = await Promise.all([
      saveApprovedOcrComposition(services.persistence, document, [second, first]),
      saveApprovedOcrComposition(services.persistence, document, [first, second]),
    ]);
    expect(concurrent).toEqual(saved);
    expect((await services.persistence.loadLatest(projectId))!.sequence).toBe(before + 1);
    expect(saved.composition.approvals.map(item => item.regionId)).toEqual(["r_1_1", "r_1_2"]);
    const key = `canonical_ocr_batch_${saved.composition.compositionHash.slice(7)}`;
    const sequence = (await services.persistence.loadLatest(projectId))!.sequence;
    expect(await loadApprovedOcrComposition(services.persistence, document, key)).toEqual(saved);
    expect(await saveApprovedOcrComposition(services.persistence, document, [first, second])).toEqual(saved);
    expect((await services.persistence.loadLatest(projectId))!.sequence).toBe(sequence);
    await expect(saveApprovedOcrComposition(services.persistence, document, [first, first])).rejects.toThrow();
    const record = (await services.persistence.loadArtifactRecord(projectId, key))!;
    services.files.set(record.fileName, new Blob(["corrupted"]));
    await expect(loadApprovedOcrComposition(services.persistence, document, key)).rejects.toThrow();
    services.state.close();
  }, 30_000);
});

import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import documentFixture from "../../../../tests/fixtures/document_ir_v2.json";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { documentIrV2Schema } from "../schemas/ingestion";
import { IndexedDbCheckpointRepository } from "./indexeddb_checkpoint_repository";
import { LocalProjectPersistence } from "./local_project_persistence";
import { OcrEvidencePersistence } from "./ocr_evidence_persistence";
import { OcrReviewPersistence } from "./ocr_review_persistence";
import { OpfsArtifactStore } from "./opfs_artifact_store";
import type { ProjectLock } from "./ports";
import { buildOcrCandidateReceipt } from "./rust_ocr_candidate";

initSync({ module: readFileSync(fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url))) });

const document = documentIrV2Schema.parse(documentFixture);
const region = document.pages[0].regions[0];
const png = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=", "base64")], { type: "image/png" });
const hash = (value: string | Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const lock: ProjectLock = { runExclusive: async (_projectId, operation) => await operation() };

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

async function seed(services: ReturnType<typeof setup>) {
  await services.persistence.persist({ schemaVersion: 1, projectId: "project_1", sequence: 1, createdAtMs: 1,
    pipelineVersion: "m4", sourceHash: document.sourceHash,
    job: { state: "VERIFYING", resumeState: null }, artifactKeys: [] }, []);
  const crop = { schemaVersion: 1 as const, documentId: document.documentId, sourceHash: document.sourceHash,
    pageNumber: 1, regionId: region.id, nativeTextHash: hash(region.sources.rawText!),
    imageHash: hash(new Uint8Array(await png.arrayBuffer())), image: png,
    bbox: region.bbox! as [number, number, number, number], pixelWidth: 1, pixelHeight: 1,
    renderScale: 2, methodVersion: "pdfjs-region-crop-v1" as const };
  const candidate = { schemaVersion: 1 as const, documentId: crop.documentId, sourceHash: crop.sourceHash,
    pageNumber: crop.pageNumber, regionId: crop.regionId, nativeTextHash: crop.nativeTextHash,
    imageHash: crop.imageHash, engineId: "fixture", engineVersion: "1", text: "RECOVERED CODE" };
  return await services.evidence.save("project_1", document,
    { crop, candidate, receipt: await buildOcrCandidateReceipt(document, candidate) });
}

describe("historical OCR review persistence", () => {
  it("round-trips an unverified review, retries idempotently, and remains historical after source change", async () => {
    const services = setup("ocr-review-roundtrip");
    const evidence = await seed(services);
    const submission = { schemaVersion: 1, receiptHash: evidence.receipt.receiptHash,
      disposition: "propose_correction", rationale: "Conferido contra a imagem.", proposedText: "RECOVERED CODE" };
    const saved = await services.review.save("project_1", document, evidence.imageArtifact, evidence.recordArtifact, submission);
    expect(saved).toMatchObject({ currentness: "not_established", receipt: { status: "unverified" },
      artifact: { kind: "ocr_review_submission", pinned: true, regenerable: false } });
    const sequence = (await services.persistence.loadLatest("project_1"))!.sequence;
    const retried = await services.review.save("project_1", document, evidence.imageArtifact, evidence.recordArtifact, submission);
    expect(retried.receipt).toEqual(saved.receipt);
    expect((await services.persistence.loadLatest("project_1"))!.sequence).toBe(sequence);
    expect((await services.review.readHistorical("project_1", document, saved.artifact,
      evidence.imageArtifact, evidence.recordArtifact)).receipt).toEqual(saved.receipt);
    const latest = (await services.persistence.loadLatest("project_1"))!;
    await services.persistence.persistNext({ schemaVersion: 1, projectId: "project_1", createdAtMs: latest.createdAtMs + 1,
      pipelineVersion: latest.pipelineVersion, sourceHash: hash("other"), job: latest.job, artifactKeys: [] }, [], latest.checksum);
    await expect(services.review.readHistorical("project_1", document, saved.artifact,
      evidence.imageArtifact, evidence.recordArtifact)).resolves.toMatchObject({ currentness: "not_established" });
    await expect(services.review.save("project_1", document, evidence.imageArtifact, evidence.recordArtifact, submission))
      .rejects.toMatchObject({ code: "SOURCE_CHANGED" });
    services.state.close();
  });

  it("rejects a forged decision, wrong evidence, and altered stored bytes", async () => {
    const services = setup("ocr-review-corruption");
    const evidence = await seed(services);
    const submission = { schemaVersion: 1, receiptHash: hash("forged"), disposition: "keep_native",
      rationale: "Conferido.", proposedText: null };
    await expect(services.review.save("project_1", document, evidence.imageArtifact, evidence.recordArtifact, submission))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    const valid = { ...submission, receiptHash: evidence.receipt.receiptHash };
    const saved = await services.review.save("project_1", document, evidence.imageArtifact, evidence.recordArtifact, valid);
    await expect(services.review.readHistorical("project_1", document, { ...saved.artifact, sizeBytes: 1 },
      evidence.imageArtifact, evidence.recordArtifact)).rejects.toMatchObject({ code: "WRONG_ARTIFACT" });
    await expect(services.review.readHistorical("project_1", document, saved.artifact,
      evidence.recordArtifact, evidence.imageArtifact)).rejects.toMatchObject({ code: "WRONG_ARTIFACT" });
    services.files.set(saved.artifact.fileName, new Blob(["tampered"]));
    await expect(services.review.readHistorical("project_1", document, saved.artifact,
      evidence.imageArtifact, evidence.recordArtifact)).rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
    services.state.close();
  });

  it("rejects save if the checkpoint changes while evidence is revalidated", async () => {
    const services = setup("ocr-review-race");
    const evidence = await seed(services);
    const submission = { schemaVersion: 1, receiptHash: evidence.receipt.receiptHash,
      disposition: "keep_native", rationale: "Conferido.", proposedText: null };
    // The review adapter creates its own evidence reader, so inject at the shared persistence boundary.
    const originalLoad = services.persistence.loadLatest.bind(services.persistence);
    let reads = 0;
    services.persistence.loadLatest = async projectId => {
      reads += 1;
      if (reads === 3) {
        const latest = await originalLoad(projectId);
        await services.persistence.persistNext({ schemaVersion: 1, projectId, createdAtMs: latest!.createdAtMs + 1,
          pipelineVersion: latest!.pipelineVersion, sourceHash: latest!.sourceHash,
          job: latest!.job, artifactKeys: latest!.artifactKeys }, [], latest!.checksum);
      }
      return await originalLoad(projectId);
    };
    await expect(services.review.save("project_1", document, evidence.imageArtifact, evidence.recordArtifact, submission))
      .rejects.toMatchObject({ code: "CHECKPOINT_CHANGED" });
    services.persistence.loadLatest = originalLoad;
    services.state.close();
  });

  it("rejects an orphan review manifest when no checkpoint binds all three artifacts", async () => {
    const services = setup("ocr-review-orphan");
    const evidence = await seed(services);
    const saved = await services.review.save("project_1", document, evidence.imageArtifact, evidence.recordArtifact,
      { schemaVersion: 1, receiptHash: evidence.receipt.receiptHash,
        disposition: "keep_native", rationale: "Conferido.", proposedText: null });
    const latest = (await services.persistence.loadLatest("project_1"))!;
    await services.state.delete("project_1", latest.sequence);
    await expect(services.review.readHistorical("project_1", document, saved.artifact,
      evidence.imageArtifact, evidence.recordArtifact)).rejects.toMatchObject({ code: "WRONG_ARTIFACT" });
    services.state.close();
  });

  it("rejects idempotent retry when checkpoint changes before its final check", async () => {
    const services = setup("ocr-review-retry-race");
    const evidence = await seed(services);
    const submission = { schemaVersion: 1, receiptHash: evidence.receipt.receiptHash,
      disposition: "keep_native", rationale: "Conferido.", proposedText: null };
    await services.review.save("project_1", document, evidence.imageArtifact, evidence.recordArtifact, submission);
    const originalRead = services.review.readHistorical.bind(services.review);
    services.review.readHistorical = async (...args) => {
      const saved = await originalRead(...args);
      const latest = (await services.persistence.loadLatest("project_1"))!;
      await services.persistence.persistNext({ schemaVersion: 1, projectId: "project_1",
        createdAtMs: latest.createdAtMs + 1, pipelineVersion: latest.pipelineVersion,
        sourceHash: latest.sourceHash, job: latest.job, artifactKeys: latest.artifactKeys }, [], latest.checksum);
      return saved;
    };
    await expect(services.review.save("project_1", document, evidence.imageArtifact, evidence.recordArtifact, submission))
      .rejects.toMatchObject({ code: "CHECKPOINT_CHANGED" });
    services.state.close();
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import documentV1Fixture from "../../../../tests/fixtures/document_ir_v1.json";
import type { ArtifactManifestRecord, CheckpointRecord } from "../schemas/persistence";
import { documentIrSchema } from "../schemas/document";
import type { ArtifactWrite } from "./ports";
import { analyzeDocumentV1 } from "./rust_content_pipeline";
import { buildReadingSession } from "./rust_reading_preview";
import { loadLiteralAudio, saveLiteralAudio } from "./saved_literal_audio";

const wasmPath = fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url));
initSync({ module: readFileSync(wasmPath) });

function wav(): Blob {
  const view = new DataView(new ArrayBuffer(46));
  view.setUint32(0, 0x46464952, true);
  view.setUint32(4, 38, true);
  view.setUint32(8, 0x45564157, true);
  view.setUint32(12, 0x20746d66, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 22_050, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x61746164, true);
  view.setUint32(40, 2, true);
  return new Blob([view.buffer], { type: "audio/wav" });
}

describe("saved literal audio", () => {
  it("commits a non-final WAV and recovers only the matching Rust reading session", async () => {
    const analysis = await analyzeDocumentV1(documentIrSchema.parse(documentV1Fixture));
    const document = analysis.documentV2;
    const session = await buildReadingSession(document, 1, 1);
    const audio = wav();
    let latest: CheckpointRecord = {
      schemaVersion: 1, projectId: document.documentId, sequence: 1, createdAtMs: 1,
      pipelineVersion: "m4.2", sourceHash: document.sourceHash,
      job: { state: "STRUCTURING", resumeState: null },
      artifactKeys: ["source_pdf", "document_ir_v2"], checksum: `sha256:${"a".repeat(64)}`,
    };
    const writes = new Map<string, ArtifactWrite>();
    const store = {
      loadLatest: vi.fn(async () => latest),
      persistNext: vi.fn(async (draft: Omit<CheckpointRecord, "sequence" | "checksum">, artifacts: ArtifactWrite[]) => {
        for (const artifact of artifacts) writes.set(artifact.artifactKey, artifact);
        latest = { ...draft, sequence: latest.sequence + 1, checksum: `sha256:${"b".repeat(64)}` };
        return { checkpoint: latest, artifacts: [] };
      }),
      loadArtifactRecord: vi.fn(async (_projectId: string, key: string) => {
        const write = writes.get(key);
        return write ? { ...write, artifactKey: key, contentHash: `sha256:${"c".repeat(64)}`,
          fileName: `v1_${"d".repeat(64)}.bin`, schemaVersion: 1, sizeBytes: write.value.size,
          lastAccessedAtMs: write.createdAtMs } as ArtifactManifestRecord : null;
      }),
      readArtifact: vi.fn(async (record: ArtifactManifestRecord) => writes.get(record.artifactKey)!.value),
    };
    await saveLiteralAudio(store, document, session, audio);
    const savedWrites = store.persistNext.mock.calls[0][1];
    expect(savedWrites.map(write => write.kind)).toEqual(["audio_chunk", "audio_metadata"]);
    expect(savedWrites.every(write => write.pinned && !write.finalArtifact)).toBe(true);
    expect(latest.artifactKeys).toHaveLength(4);
    await expect(loadLiteralAudio(store, document)).resolves.toMatchObject({ blob: audio, startPage: 1, endPage: 1 });
    const newerAudio = wav();
    await saveLiteralAudio(store, document, session, newerAudio);
    expect(latest.artifactKeys.filter(key => /^literal_wav_[0-9a-f]{32}$/.test(key))).toHaveLength(1);
    await expect(loadLiteralAudio(store, document)).resolves.toMatchObject({ blob: newerAudio, startPage: 1, endPage: 1 });
    await expect(loadLiteralAudio(store, { ...document, sourceHash: `sha256:${"e".repeat(64)}` }))
      .resolves.toBeNull();
    await expect(saveLiteralAudio(store, document, { ...session, pages: [{ ...session.pages[0],
      chunks: [{ ...session.pages[0].chunks[0], text: "Texto alterado" }] }] }, audio)).rejects.toThrow(/sessão mudou/);
    const metaKey = latest.artifactKeys.find(key => key.endsWith("_meta"))!;
    const storedMeta = writes.get(metaKey)!;
    writes.set(metaKey, { ...storedMeta, value: new Blob([JSON.stringify({
      ...JSON.parse(await storedMeta.value.text()), sessionHash: `sha256:${"f".repeat(64)}`,
    })], { type: "application/json" }) });
    await expect(loadLiteralAudio(store, document)).resolves.toBeNull();
    writes.set(metaKey, { ...storedMeta, value: new Blob(["{"], { type: "application/json" }) });
    await expect(loadLiteralAudio(store, document)).resolves.toBeNull();
  });
});

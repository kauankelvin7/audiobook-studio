import { describe, expect, it, vi } from "vitest";
import { joinValidatedWavs, readingTextForTts, renderLocalWav, splitTextForTts, validateWav } from "./local_wav";
import type { ReadingSession } from "./rust_reading_preview";

const session: ReadingSession = {
  documentId: "doc", sourceHash: "sha256:abc", startPage: 1, endPage: 1,
  pages: [{ documentId: "doc", sourceHash: "sha256:abc", pageNumber: 1,
    chunks: [{ regionId: "a", text: "Primeiro." }, { regionId: "b", text: "Segundo." }] }],
};

function wav(): Blob {
  const bytes = new ArrayBuffer(46);
  const view = new DataView(bytes);
  view.setUint32(0, 0x46464952, true);
  view.setUint32(4, 38, true);
  view.setUint32(8, 0x45564157, true);
  view.setUint32(12, 0x20746d66, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 22_050, true);
  view.setUint32(28, 44_100, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x61746164, true);
  view.setUint32(40, 2, true);
  return new Blob([bytes], { type: "audio/wav" });
}

describe("local WAV adapter", () => {
  it("passes every reviewed region in order without omission", () => {
    expect(readingTextForTts(session)).toBe("Primeiro.\nSegundo.");
    expect(() => readingTextForTts({ ...session, pages: [{ ...session.pages[0], chunks: [] }] }))
      .toThrowError(/íntegra/);
    expect(() => readingTextForTts({ ...session, pages: [{ ...session.pages[0], chunks: [{ regionId: "a", text: "x".repeat(12_001) }] }] }))
      .toThrowError(/12 mil/);
  });

  it("splits long synthesis input without losing token order", () => {
    const text = Array.from({ length: 90 }, (_, index) => `Frase ${index}. conteúdo`).join(" ");
    const chunks = splitTextForTts(text, 128);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.length <= 128)).toBe(true);
    expect(chunks.join(" ").split(/\s+/)).toEqual(text.split(/\s+/));
  });

  it("accepts complete PCM WAV and rejects corrupt output", async () => {
    await expect(validateWav(wav())).resolves.toBeUndefined();
    await expect(validateWav(new Blob([new Uint8Array(44)]))).rejects.toMatchObject({ code: "INVALID_AUDIO" });
    const truncated = wav().slice(0, 44);
    await expect(validateWav(truncated)).rejects.toMatchObject({ code: "INVALID_AUDIO" });
  });

  it("joins checked PCM chunks into one decodable WAV in source order", async () => {
    const first = wav();
    const secondBytes = new Uint8Array(await wav().arrayBuffer());
    secondBytes[44] = 7;
    secondBytes[45] = 9;
    const combined = await joinValidatedWavs([first, new Blob([secondBytes], { type: "audio/wav" })]);
    await expect(validateWav(combined)).resolves.toBeUndefined();
    const bytes = new Uint8Array(await combined.arrayBuffer());
    expect(Array.from(bytes.slice(44))).toEqual([0, 0, 7, 9]);
    await expect(joinValidatedWavs([])).rejects.toMatchObject({ code: "INVALID_AUDIO" });
  });

  it("reuses one worker for multiple synthesis chunks and joins the results", async () => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as Worker["onmessage"], onerror: null as Worker["onerror"] };
    const longSession: ReadingSession = {
      ...session,
      pages: [{ ...session.pages[0], chunks: [{ regionId: "a", text: "Primeira frase. ".repeat(20) }] }],
    };
    const promise = renderLocalWav(longSession, new AbortController().signal, vi.fn(), () => worker, 128);
    const request = worker.postMessage.mock.calls[0][0] as { type: string; texts: string[] };
    expect(request.type).toBe("render");
    expect(request.texts.length).toBeGreaterThan(1);
    request.texts.forEach((_, index) => {
      worker.onmessage?.call(worker as unknown as Worker, { data: { type: "chunk", index, wav: wav() } } as MessageEvent);
    });
    worker.onmessage?.call(worker as unknown as Worker, { data: { type: "complete", count: request.texts.length } } as MessageEvent);
    await expect(promise).resolves.toBeInstanceOf(Blob);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects and terminates on cancellation or engine failure", async () => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as Worker["onmessage"], onerror: null as Worker["onerror"] };
    const controller = new AbortController();
    const promise = renderLocalWav(session, controller.signal, vi.fn(), () => worker);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "CANCELLED" });
    expect(worker.terminate).toHaveBeenCalledOnce();

    const failedWorker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as Worker["onmessage"], onerror: null as Worker["onerror"] };
    const failed = renderLocalWav(session, new AbortController().signal, vi.fn(), () => failedWorker);
    failedWorker.onmessage?.call(failedWorker as unknown as Worker, {
      data: { type: "error", message: "Failed to fetch voice model" },
    } as MessageEvent);
    await expect(failed).rejects.toMatchObject({
      code: "ENGINE_FAILED",
      message: "Failed to fetch voice model",
    });
  });
});

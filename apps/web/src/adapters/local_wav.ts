import type { ReadingSession } from "./rust_reading_preview";

export type WavProgress = { loaded: number; total: number };
type WorkerPort = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror">;
type WorkerFactory = () => WorkerPort;

const MAX_RENDER_CHARS = 12_000;
const MAX_WAV_BYTES = 80 * 1024 * 1024;
const MAX_COMPLETE_WAV_BYTES = 512 * 1024 * 1024;

export class LocalWavError extends Error {
  constructor(public readonly code: "INVALID_SESSION" | "TOO_LONG" | "ENGINE_FAILED" | "INVALID_AUDIO" | "CANCELLED", message: string) {
    super(message);
    this.name = "LocalWavError";
  }
}

export function readingTextForTts(session: ReadingSession): string {
  if (!session.pages.length || session.pages.length > 10 || session.endPage - session.startPage + 1 !== session.pages.length
    || session.pages.some((page, index) => page.documentId !== session.documentId || page.sourceHash !== session.sourceHash
      || page.pageNumber !== session.startPage + index || !page.chunks.length
      || page.chunks.some(chunk => !chunk.regionId || !chunk.text.trim()))) {
    throw new LocalWavError("INVALID_SESSION", "A sessão de leitura não está íntegra.");
  }
  const text = session.pages.flatMap(page => page.chunks.map(chunk => chunk.text)).join("\n");
  if (text.length > MAX_RENDER_CHARS) {
    throw new LocalWavError("TOO_LONG", "O trecho excede o limite de 12 mil caracteres para gerar WAV. Selecione menos páginas.");
  }
  return text;
}

export async function validateWav(blob: Blob, maxBytes = MAX_WAV_BYTES): Promise<void> {
  if (!(blob instanceof Blob) || blob.size < 46 || blob.size > maxBytes) {
    throw new LocalWavError("INVALID_AUDIO", "O áudio gerado está vazio ou excede o limite seguro.");
  }
  const header = new DataView(await blob.slice(0, 44).arrayBuffer());
  const word = (offset: number) => header.getUint32(offset, true);
  if (word(0) !== 0x46464952 || word(8) !== 0x45564157 || word(12) !== 0x20746d66
    || word(36) !== 0x61746164 || word(4) !== blob.size - 8 || word(40) !== blob.size - 44
    || header.getUint16(20, true) !== 1 || header.getUint16(22, true) !== 1
    || header.getUint16(34, true) !== 16 || word(24) !== 22_050 || word(28) !== 44_100
    || header.getUint16(32, true) !== 2 || word(40) === 0 || word(40) % 2 !== 0) {
    throw new LocalWavError("INVALID_AUDIO", "O motor retornou um WAV incompatível ou incompleto.");
  }
}

export async function joinValidatedWavs(chunks: Blob[]): Promise<Blob> {
  if (chunks.length === 0) throw new LocalWavError("INVALID_AUDIO", "Nenhum trecho de áudio foi gerado.");
  let pcmBytes = 0;
  const pcm: Blob[] = [];
  for (const chunk of chunks) {
    await validateWav(chunk);
    const header = new DataView(await chunk.slice(0, 44).arrayBuffer());
    if (header.getUint32(16, true) !== 16 || header.getUint16(32, true) !== 2) {
      throw new LocalWavError("INVALID_AUDIO", "Os trechos WAV têm formatos incompatíveis.");
    }
    pcmBytes += chunk.size - 44;
    if (pcmBytes + 44 > MAX_COMPLETE_WAV_BYTES || pcmBytes > 0xfffffff7) {
      throw new LocalWavError("TOO_LONG", "O audiobook excede o limite de 512 MB em WAV.");
    }
    pcm.push(chunk.slice(44));
  }
  const buffer = new ArrayBuffer(44);
  const header = new DataView(buffer);
  header.setUint32(0, 0x46464952, true);
  header.setUint32(4, pcmBytes + 36, true);
  header.setUint32(8, 0x45564157, true);
  header.setUint32(12, 0x20746d66, true);
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, 22_050, true);
  header.setUint32(28, 44_100, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  header.setUint32(36, 0x61746164, true);
  header.setUint32(40, pcmBytes, true);
  const result = new Blob([buffer, ...pcm], { type: "audio/wav" });
  await validateWav(result, MAX_COMPLETE_WAV_BYTES);
  return result;
}

export function renderLocalWav(session: ReadingSession, signal: AbortSignal, onProgress: (progress: WavProgress) => void,
  workerFactory: WorkerFactory = () => new Worker(new URL("../workers/local_tts.worker.ts", import.meta.url), { type: "module" })): Promise<Blob> {
  const text = readingTextForTts(session);
  if (signal.aborted) return Promise.reject(new LocalWavError("CANCELLED", "Geração cancelada."));
  return new Promise((resolve, reject) => {
    let worker: WorkerPort;
    try {
      worker = workerFactory();
    } catch {
      reject(new LocalWavError("ENGINE_FAILED", "O motor de áudio não pôde ser iniciado neste navegador."));
      return;
    }
    let settled = false;
    const finish = (error?: LocalWavError, wav?: Blob) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(wav!);
    };
    const abort = () => finish(new LocalWavError("CANCELLED", "Geração cancelada."));
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => finish(new LocalWavError("ENGINE_FAILED", "Falha ao gerar áudio localmente."));
    worker.onmessage = async event => {
      if (settled) return;
      const message: unknown = event.data;
      if (!message || typeof message !== "object" || !("type" in message)) return;
      if (message.type === "progress" && "loaded" in message && "total" in message
        && typeof message.loaded === "number" && typeof message.total === "number") {
        onProgress({ loaded: message.loaded, total: message.total });
      } else if (message.type === "result" && "wav" in message) {
        try {
          await validateWav(message.wav as Blob);
          if (!signal.aborted) finish(undefined, message.wav as Blob);
        } catch {
          finish(new LocalWavError("INVALID_AUDIO", "O arquivo de áudio recebido não passou na validação."));
        }
      } else if (message.type === "error") {
        const detail = "message" in message && typeof message.message === "string" && message.message.trim()
          ? message.message.trim()
          : "Não foi possível gerar áudio. Confira conexão, espaço livre e suporte a WebAssembly.";
        finish(new LocalWavError("ENGINE_FAILED", detail));
      }
    };
    worker.postMessage({ type: "render", text });
    if (signal.aborted) abort();
  });
}

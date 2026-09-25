import { TtsSession } from "@mintplex-labs/piper-tts-web";

type Request = { type: "render"; texts: string[] };
type Response =
  | { type: "progress"; loaded: number; total: number }
  | { type: "chunk"; index: number; wav: Blob }
  | { type: "complete"; count: number }
  | { type: "error"; message: string };

self.onmessage = async (event: MessageEvent<Request>) => {
  if (event.data.type !== "render") return;
  const texts = event.data.texts.filter(text => typeof text === "string" && text.trim());
  if (!texts.length || texts.length !== event.data.texts.length) {
    self.postMessage({ type: "error", message: "A fila de síntese está vazia ou inválida." } satisfies Response);
    return;
  }

  try {
    const base = `${import.meta.env.BASE_URL}tts-runtime/`;
    const session = await TtsSession.create({
      voiceId: "pt_BR-faber-medium",
      wasmPaths: {
        onnxWasm: base,
        piperData: `${base}piper_phonemize.data`,
        piperWasm: `${base}piper_phonemize.wasm`,
      },
      progress: progress => {
        if (progress.total > 0 && progress.loaded >= 0) {
          self.postMessage({ type: "progress", loaded: progress.loaded, total: progress.total } satisfies Response);
        }
      },
    });

    for (const [index, text] of texts.entries()) {
      const wav = await session.predict(text);
      self.postMessage({ type: "chunk", index, wav } satisfies Response);
    }
    self.postMessage({ type: "complete", count: texts.length } satisfies Response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "Falha desconhecida no motor de voz.");
    self.postMessage({ type: "error", message: message.slice(0, 500) } satisfies Response);
  }
};

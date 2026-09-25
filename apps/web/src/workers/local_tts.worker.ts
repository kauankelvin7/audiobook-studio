import { TtsSession } from "@mintplex-labs/piper-tts-web";

type Request = { type: "render"; text: string };
type Response =
  | { type: "progress"; loaded: number; total: number }
  | { type: "result"; wav: Blob }
  | { type: "error" };

self.onmessage = async (event: MessageEvent<Request>) => {
  if (event.data.type !== "render") return;
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
    const wav = await session.predict(event.data.text);
    self.postMessage({ type: "result", wav } satisfies Response);
  } catch {
    self.postMessage({ type: "error" } satisfies Response);
  }
};

import { createWorker, OEM, type Worker } from "tesseract.js";
import type { LocalOcrEngine } from "./local_ocr_candidate";

const OCR_RUNTIME_VERSION = "7.0.0-por-best-int-1";

function localUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}ocr-runtime/${path}`, window.location.origin).href;
}

/** All executable and language assets are served from this app's origin. */
export class TesseractLocalOcrEngine implements LocalOcrEngine {
  readonly id = "tesseract-js-local-por";
  readonly version = OCR_RUNTIME_VERSION;

  async recognize(image: Blob, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw new DOMException("OCR cancelled", "AbortError");
    let worker: Worker | undefined;
    let terminated = false;
    const abort = () => {
      if (worker) {
        terminated = true;
        void worker.terminate();
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      worker = await createWorker("por", OEM.LSTM_ONLY, {
        workerPath: localUrl("worker.min.js"),
        corePath: localUrl("core"),
        langPath: localUrl("lang"),
        workerBlobURL: false,
        cacheMethod: "none",
      });
      if (signal.aborted) throw new DOMException("OCR cancelled", "AbortError");
      const result = await worker.recognize(image);
      if (signal.aborted) throw new DOMException("OCR cancelled", "AbortError");
      return result.data.text;
    } finally {
      signal.removeEventListener("abort", abort);
      if (worker && !terminated) await worker.terminate();
    }
  }
}

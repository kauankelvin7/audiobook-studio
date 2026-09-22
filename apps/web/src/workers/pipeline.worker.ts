import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { extractPdf, PdfImportError } from "../adapters/pdf";
import type { PipelineMessage, PipelineResponse } from "./protocol";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

self.onmessage = async (event: MessageEvent<PipelineMessage>) => {
  if (event.data.type !== "extract") return;
  try {
    const bytes = new Uint8Array(await event.data.file.arrayBuffer());
    const document = await extractPdf(bytes);
    self.postMessage({ type: "result", document } satisfies PipelineResponse);
  } catch (error) {
    const response: PipelineResponse = error instanceof PdfImportError
      ? { type: "error", code: error.code, message: error.message }
      : { type: "error", code: "UNEXPECTED_ERROR", message: "Não foi possível concluir a importação. Tente outro PDF." };
    self.postMessage(response);
  }
};

import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { extractPdf, PdfImportError } from "../adapters/pdf";
import { analyzeDocumentV1, RustContentError } from "../adapters/rust_content_pipeline";
import type { PipelineMessage, PipelineResponse } from "./protocol";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

self.onmessage = async (event: MessageEvent<PipelineMessage>) => {
  if (event.data.type !== "extract") return;
  try {
    const bytes = new Uint8Array(await event.data.file.arrayBuffer());
    const document = await extractPdf(bytes);
    const analysis = await analyzeDocumentV1(document);
    self.postMessage({ type: "result", document, ...analysis } satisfies PipelineResponse);
  } catch (error) {
    const response: PipelineResponse = error instanceof PdfImportError
      ? { type: "error", code: error.code, message: error.message }
      : error instanceof RustContentError
        ? { type: "error", code: error.code, message: "Não foi possível analisar este PDF neste dispositivo." }
      : { type: "error", code: "UNEXPECTED_ERROR", message: "Não foi possível concluir a importação. Tente outro PDF." };
    self.postMessage(response);
  }
};

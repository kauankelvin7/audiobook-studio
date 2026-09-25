import type { DocumentIrV2 } from "../schemas/ingestion";
import type { OcrCandidate, OcrCandidateReceipt } from "../schemas/ocr_candidate";
import { capturePdfOcrRegion, type OcrRegionCrop } from "./pdf_ocr_crop";
import { buildOcrCandidateReceipt } from "./rust_ocr_candidate";

export interface LocalOcrEngine {
  readonly id: string;
  readonly version: string;
  recognize(image: Blob, signal: AbortSignal): Promise<string>;
}

export type LocalOcrCandidateResult = {
  crop: OcrRegionCrop;
  candidate: OcrCandidate;
  receipt: OcrCandidateReceipt;
};

const OCR_TIMEOUT_MS = 15_000;

/** Runs one bounded OCR request. The Rust receipt is pending, never an approval. */
export async function proposeLocalOcrCandidate(
  pdfBytes: Uint8Array,
  document: DocumentIrV2,
  pageNumber: number,
  regionId: string,
  engine: LocalOcrEngine,
  signal?: AbortSignal,
): Promise<LocalOcrCandidateResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let removeAbortWaiter: (() => void) | undefined;
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const crop = await capturePdfOcrRegion(pdfBytes, document, pageNumber, regionId, controller.signal);
    if (controller.signal.aborted) throw new DOMException("OCR cancelled", "AbortError");
    const text = await Promise.race([
      engine.recognize(crop.image, controller.signal),
      new Promise<never>((_, reject) => {
        const onAbort = () => reject(new DOMException("OCR cancelled", "AbortError"));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        removeAbortWaiter = () => controller.signal.removeEventListener("abort", onAbort);
        timeout = setTimeout(() => {
          controller.abort();
        }, OCR_TIMEOUT_MS);
      }),
    ]);
    if (controller.signal.aborted) throw new DOMException("OCR cancelled", "AbortError");
    const candidate: OcrCandidate = {
      schemaVersion: 1,
      documentId: crop.documentId,
      sourceHash: crop.sourceHash,
      pageNumber: crop.pageNumber,
      regionId: crop.regionId,
      nativeTextHash: crop.nativeTextHash,
      imageHash: crop.imageHash,
      engineId: engine.id,
      engineVersion: engine.version,
      text,
    };
    const receipt = await buildOcrCandidateReceipt(document, candidate);
    if (controller.signal.aborted) throw new DOMException("OCR cancelled", "AbortError");
    return { crop, candidate, receipt };
  } finally {
    if (timeout) clearTimeout(timeout);
    removeAbortWaiter?.();
    signal?.removeEventListener("abort", abort);
  }
}

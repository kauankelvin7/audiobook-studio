import { AnnotationMode, getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { documentIrV2Schema, type DocumentIrV2 } from "../schemas/ingestion";
import { PAGE_OCR_TARGET_ID } from "../schemas/ocr_candidate";

const MAX_OCR_PDF_BYTES = 8_000_000;
const MAX_CROP_PIXELS = 4_000_000;
const MAX_CROP_SIDE = 4_096;
const RENDER_SCALE = 2;
const CAPTURE_TIMEOUT_MS = 15_000;
if (typeof window !== "undefined") GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PdfOcrCropErrorCode = "INVALID_INPUT" | "SOURCE_MISMATCH" | "UNKNOWN_REGION" | "INVALID_BOUNDS" | "RESOURCE_LIMIT" | "CANCELLED" | "RENDER_FAILED";

export class PdfOcrCropError extends Error {
  constructor(public readonly code: PdfOcrCropErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PdfOcrCropError";
  }
}

export type OcrRegionCrop = {
  schemaVersion: 1;
  documentId: string;
  sourceHash: string;
  pageNumber: number;
  regionId: string;
  nativeTextHash: string;
  imageHash: string;
  image: Blob;
  bbox: [number, number, number, number];
  pixelWidth: number;
  pixelHeight: number;
  renderScale: number;
  methodVersion: "pdfjs-region-crop-v1" | "pdfjs-page-crop-v1";
};

async function hash(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function planPdfRegionCrop(
  bbox: [number, number, number, number],
  pageView: number[],
  viewportRectangle: number[],
): { left: number; top: number; width: number; height: number } {
  if (bbox.length !== 4 || pageView.length !== 4 || viewportRectangle.length !== 4
    || ![...bbox, ...pageView, ...viewportRectangle].every(Number.isFinite)
    || bbox[0] < pageView[0] || bbox[1] < pageView[1] || bbox[2] > pageView[2] || bbox[3] > pageView[3]
    || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    throw new PdfOcrCropError("INVALID_BOUNDS", "A região OCR está fora da página ou não tem área válida.");
  }
  const left = Math.floor(Math.min(viewportRectangle[0], viewportRectangle[2]));
  const top = Math.floor(Math.min(viewportRectangle[1], viewportRectangle[3]));
  const right = Math.ceil(Math.max(viewportRectangle[0], viewportRectangle[2]));
  const bottom = Math.ceil(Math.max(viewportRectangle[1], viewportRectangle[3]));
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1 || width > MAX_CROP_SIDE || height > MAX_CROP_SIDE || width * height > MAX_CROP_PIXELS) {
    throw new PdfOcrCropError("RESOURCE_LIMIT", "A região OCR excede o limite seguro de pixels.");
  }
  return { left, top, width, height };
}

export async function readPdfPageCropPlan(pdfBytes: Uint8Array, sourceHash: string, pageNumber: number): Promise<{
  bbox: [number, number, number, number]; pixelWidth: number; pixelHeight: number;
}> {
  if (pdfBytes.byteLength < 5 || pdfBytes.byteLength > MAX_OCR_PDF_BYTES
    || String.fromCharCode(...pdfBytes.subarray(0, 5)) !== "%PDF-"
    || !Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    throw new PdfOcrCropError("INVALID_INPUT", "A fonte PDF da página OCR é inválida.");
  }
  if (await hash(pdfBytes.slice().buffer) !== sourceHash) {
    throw new PdfOcrCropError("SOURCE_MISMATCH", "A fonte PDF da página OCR não confere.");
  }
  const task = getDocument({ data: pdfBytes.slice(), stopAtErrors: true, maxImageSize: MAX_CROP_PIXELS, isEvalSupported: false });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const geometry = await Promise.race([
      (async () => {
        const pdf = await task.promise;
        if (pageNumber > pdf.numPages) throw new PdfOcrCropError("UNKNOWN_REGION", "A página OCR não existe no PDF.");
        const page = await pdf.getPage(pageNumber);
        try {
          const bbox = [...page.view] as [number, number, number, number];
          const viewport = page.getViewport({ scale: RENDER_SCALE });
          const crop = planPdfRegionCrop(bbox, page.view, viewport.convertToViewportRectangle(bbox));
          return { bbox, pixelWidth: crop.width, pixelHeight: crop.height };
        } finally { page.cleanup(); }
      })(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new PdfOcrCropError("RESOURCE_LIMIT", "A leitura da página OCR excedeu o tempo seguro.")), CAPTURE_TIMEOUT_MS); }),
    ]);
    return geometry;
  } finally {
    if (timeout) clearTimeout(timeout);
    await task.destroy();
  }
}

export async function capturePdfOcrRegion(
  pdfBytes: Uint8Array,
  documentInput: DocumentIrV2,
  pageNumber: number,
  regionId: string,
  signal?: AbortSignal,
): Promise<OcrRegionCrop> {
  const parsed = documentIrV2Schema.safeParse(documentInput);
  if (!parsed.success || !Number.isSafeInteger(pageNumber) || pageNumber < 1 || !regionId.trim()
    || pdfBytes.byteLength < 5
    || String.fromCharCode(...pdfBytes.subarray(0, 5)) !== "%PDF-") {
    throw new PdfOcrCropError("INVALID_INPUT", "O PDF, documento ou endereço da região OCR é inválido.");
  }
  if (pdfBytes.byteLength > MAX_OCR_PDF_BYTES) {
    throw new PdfOcrCropError("RESOURCE_LIMIT", "O PDF excede o limite de 8 MB para captura OCR.");
  }
  if (signal?.aborted) throw new PdfOcrCropError("CANCELLED", "A captura OCR foi cancelada.");
  const document = parsed.data;
  if (await hash(pdfBytes.slice().buffer) !== document.sourceHash) {
    throw new PdfOcrCropError("SOURCE_MISMATCH", "O PDF não corresponde à fonte ativa do documento.");
  }
  const documentPage = document.pages[pageNumber - 1];
  const pageTarget = regionId === PAGE_OCR_TARGET_ID && documentPage?.extractionQuality === "no_text"
    && documentPage.regions.length === 0 && documentPage.rawText.length === 0;
  const region = documentPage?.regions.find(item => item.id === regionId);
  if (!pageTarget && (!region || region.sources.rawText === null)) {
    throw new PdfOcrCropError("UNKNOWN_REGION", "A região não existe ou não possui texto nativo para comparação.");
  }
  if (!pageTarget && !region?.bbox) throw new PdfOcrCropError("INVALID_BOUNDS", "A região não possui coordenadas para captura.");
  const nativeText = pageTarget ? documentPage.rawText : region!.sources.rawText!;

  const loadingTask = getDocument({ data: pdfBytes.slice(), stopAtErrors: true, maxImageSize: MAX_CROP_PIXELS, isEvalSupported: false });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  let renderTask: { cancel(): void } | null = null;
  let interrupted = false;
  const interruption = new Promise<never>((_, reject) => {
    const stop = (error: PdfOcrCropError) => {
      interrupted = true;
      try { renderTask?.cancel(); } catch { /* A renderização pode já ter terminado. */ }
      void loadingTask.destroy().catch(() => undefined);
      reject(error);
    };
    abortListener = () => stop(new PdfOcrCropError("CANCELLED", "A captura OCR foi cancelada."));
    signal?.addEventListener("abort", abortListener, { once: true });
    timeout = setTimeout(() => stop(new PdfOcrCropError("RESOURCE_LIMIT", "A captura OCR excedeu o tempo seguro.")), CAPTURE_TIMEOUT_MS);
    if (signal?.aborted) abortListener();
  });
  try {
    return await Promise.race([(async (): Promise<OcrRegionCrop> => {
    const pdf = await loadingTask.promise;
    if (pageNumber > pdf.numPages) throw new PdfOcrCropError("UNKNOWN_REGION", "A página não existe no PDF.");
    const page = await pdf.getPage(pageNumber);
    try {
      const bbox = pageTarget ? [...page.view] as [number, number, number, number] : region!.bbox!;
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const rectangle = viewport.convertToViewportRectangle(bbox);
      const crop = planPdfRegionCrop(bbox, page.view, rectangle);
      if (signal?.aborted) throw new PdfOcrCropError("CANCELLED", "A captura OCR foi cancelada.");
      const canvas = globalThis.document?.createElement("canvas");
      if (!canvas) throw new PdfOcrCropError("RENDER_FAILED", "Canvas indisponível para capturar região OCR.");
      canvas.width = crop.width;
      canvas.height = crop.height;
      const render = page.render({ canvas, viewport, transform: [1, 0, 0, 1, -crop.left, -crop.top], annotationMode: AnnotationMode.DISABLE });
      renderTask = render;
      await render.promise;
      if (signal?.aborted) throw new PdfOcrCropError("CANCELLED", "A captura OCR foi cancelada.");
      const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed")), "image/png"));
      if (image.type !== "image/png" || image.size === 0 || image.size > 16_000_000) {
        throw new PdfOcrCropError("RESOURCE_LIMIT", "A imagem OCR excede o limite seguro de armazenamento.");
      }
      return {
        schemaVersion: 1, documentId: document.documentId, sourceHash: document.sourceHash,
        pageNumber, regionId, nativeTextHash: await hash(new TextEncoder().encode(nativeText)),
        imageHash: await hash(await image.arrayBuffer()), image, bbox,
        pixelWidth: crop.width, pixelHeight: crop.height, renderScale: RENDER_SCALE,
        methodVersion: pageTarget ? "pdfjs-page-crop-v1" : "pdfjs-region-crop-v1",
      };
    } finally {
      page.cleanup();
    }
    })(), interruption]);
  } catch (error) {
    if (error instanceof PdfOcrCropError) throw error;
    throw new PdfOcrCropError("RENDER_FAILED", "Não foi possível capturar a região OCR.", { cause: error });
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortListener) signal?.removeEventListener("abort", abortListener);
    if (!interrupted) await loadingTask.destroy();
  }
}

import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfZoomMode = "fit-width" | "fit-page" | "custom";
type ViewportSize = { width: number; height: number };

const PDF_CSS_UNITS = 96 / 72;
const MAX_RASTER_PIXELS = 18_000_000;
const PAGE_GUTTER = 32;

function safeOutputScale(viewport: { width: number; height: number }) {
  const deviceScale = Math.min(globalThis.devicePixelRatio || 1, 2);
  const cssPixels = Math.max(1, viewport.width * viewport.height);
  const pixelLimitedScale = Math.sqrt(MAX_RASTER_PIXELS / cssPixels);
  return Math.max(0.25, Math.min(deviceScale, pixelLimitedScale));
}

export function PdfOriginalPage({
  source,
  pageNumber,
  zoom,
  zoomMode,
  onResolvedZoom,
}: {
  source: Blob;
  pageNumber: number;
  zoom: number;
  zoomMode: PdfZoomMode;
  onResolvedZoom?: (zoom: number) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [readyVersion, setReadyVersion] = useState(0);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });

  useEffect(() => {
    const shell = shellRef.current;
    const scrollHost = shell?.closest(".paper-scroll");
    if (!(scrollHost instanceof HTMLElement)) return;

    const update = () => setViewportSize({ width: scrollHost.clientWidth, height: scrollHost.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scrollHost);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    let loadedPdf: PDFDocumentProxy | null = null;

    void (async () => {
      const bytes = new Uint8Array(await source.arrayBuffer());
      if (cancelled) return;
      loadingTask = getDocument({ data: bytes, stopAtErrors: true });
      loadedPdf = await loadingTask.promise;
      if (cancelled) {
        await loadedPdf.destroy();
        return;
      }
      pdfRef.current = loadedPdf;
      setReadyVersion(version => version + 1);
    })().catch(() => {
      if (!cancelled) {
        pdfRef.current = null;
        setReadyVersion(version => version + 1);
      }
    });

    return () => {
      cancelled = true;
      if (pdfRef.current === loadedPdf) pdfRef.current = null;
      void loadingTask?.destroy().catch(() => undefined);
    };
  }, [source]);

  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || pageNumber < 1 || pageNumber > pdf.numPages) return;

    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;

    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) {
        page.cleanup();
        return;
      }

      const base = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(220, viewportSize.width - PAGE_GUTTER);
      const availableHeight = Math.max(320, viewportSize.height - PAGE_GUTTER);
      const fitWidthScale = availableWidth / base.width;
      const fitPageScale = Math.min(fitWidthScale, availableHeight / base.height);
      const scale = zoomMode === "fit-width"
        ? fitWidthScale
        : zoomMode === "fit-page"
          ? fitPageScale
          : PDF_CSS_UNITS * (zoom / 100);
      const boundedScale = Math.max(0.25, Math.min(4, scale));
      const viewport = page.getViewport({ scale: boundedScale });
      const resolvedZoom = Math.round((boundedScale / PDF_CSS_UNITS) * 100);
      onResolvedZoom?.(resolvedZoom);

      const outputScale = safeOutputScale(viewport);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        page.cleanup();
        return;
      }

      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      try {
        await renderTask.promise;
      } finally {
        page.cleanup();
      }
    })().catch(error => {
      if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, zoom, zoomMode, readyVersion, viewportSize.width, viewportSize.height, onResolvedZoom]);

  return <div ref={shellRef} className="original-page-shell" aria-label={`Página ${pageNumber} no formato original`}>
    <canvas ref={canvasRef} className="original-page-canvas" />
  </div>;
}

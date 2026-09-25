import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function PdfOriginalPage({
  source,
  pageNumber,
  zoom,
}: {
  source: Blob;
  pageNumber: number;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [readyVersion, setReadyVersion] = useState(0);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => setAvailableWidth(Math.max(1, shell.clientWidth - 32));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setError("");
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
        setError("Não foi possível abrir a página original. Use a visualização Texto ou reabra o PDF.");
        setRendering(false);
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
    if (!pdf || !canvas || availableWidth <= 0 || pageNumber < 1 || pageNumber > pdf.numPages) return;
    setRendering(true);
    setError("");

    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;

    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) {
        page.cleanup();
        return;
      }
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (availableWidth / original.width) * zoom / 100 });
      const outputScale = Math.min(globalThis.devicePixelRatio || 1, 2);
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
        if (!cancelled) setRendering(false);
      } finally {
        page.cleanup();
      }
    })().catch(error => {
      if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, canvas.width, canvas.height);
        setError("Não foi possível exibir esta página. Tente novamente ou use a visualização Texto.");
        setRendering(false);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, zoom, readyVersion, availableWidth]);

  return <div ref={shellRef} className="original-page-shell" aria-label={`Página ${pageNumber} no formato original`} aria-busy={rendering}>
    {error && <p role="alert" className="notice">{error}</p>}
    {rendering && !error && <span className="pdf-loading" role="status">Carregando página…</span>}
    <canvas ref={canvasRef} className="original-page-canvas" />
  </div>;
}

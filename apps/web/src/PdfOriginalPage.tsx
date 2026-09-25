import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Cache global de instâncias de PDF para navegação instantânea entre páginas sem re-parsear
const pdfCache = new WeakMap<Blob, Promise<PDFDocumentProxy>>();

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
  const [containerWidth, setContainerWidth] = useState(0);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const currentRenderTask = useRef<ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null>(null);

  // 1. Mede o container PAI (.paper-scroll), que tem largura estável e NÃO entra em loop com o canvas
  useEffect(() => {
    const parent = shellRef.current?.parentElement || shellRef.current;
    if (!parent) return;

    const updateWidth = () => {
      const w = parent.clientWidth;
      if (w > 0) {
        setContainerWidth(Math.max(280, w - 48));
      }
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  // 2. Carrega o documento PDF apenas UMA VEZ por Blob (reutilizando a promessa em cache)
  useEffect(() => {
    setError("");
    let cancelled = false;

    let promise = pdfCache.get(source);
    if (!promise) {
      promise = (async () => {
        const bytes = new Uint8Array(await source.arrayBuffer());
        const task = getDocument({ data: bytes, stopAtErrors: true });
        return task.promise;
      })();
      pdfCache.set(source, promise);
    }

    promise
      .then(loadedPdf => {
        if (!cancelled) {
          pdfDocRef.current = loadedPdf;
          // Força render inicial assim que o PDF estiver pronto
          renderPage(loadedPdf, pageNumber, zoom, containerWidth);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Não foi possível abrir o PDF original. Use a visualização Texto.");
          setRendering(false);
          pdfDocRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [source]);

  // Função isolada de render da página do PDF
  async function renderPage(pdf: PDFDocumentProxy, num: number, zoomLevel: number, width: number) {
    const canvas = canvasRef.current;
    if (!canvas || !pdf || width <= 0 || num < 1 || num > pdf.numPages) return;

    // Cancela qualquer render anterior em andamento
    if (currentRenderTask.current) {
      currentRenderTask.current.cancel();
      currentRenderTask.current = null;
    }

    setRendering(true);
    setError("");

    try {
      const page = await pdf.getPage(num);
      const original = page.getViewport({ scale: 1 });
      // Escala base para caber no container com folga confortável
      const baseScale = width / original.width;
      const targetScale = baseScale * (zoomLevel / 100);
      const viewport = page.getViewport({ scale: targetScale });
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

      const task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });

      currentRenderTask.current = task;
      await task.promise;
      setRendering(false);
      page.cleanup();
    } catch (err) {
      if (!(err instanceof Error && err.name === "RenderingCancelledException")) {
        setError("Não foi possível exibir esta página original. Tente novamente.");
        setRendering(false);
      }
    }
  }

  // 3. Atualização veloz ao trocar de página, zoom ou largura do container
  useEffect(() => {
    if (!pdfDocRef.current || containerWidth <= 0) return;
    void renderPage(pdfDocRef.current, pageNumber, zoom, containerWidth);

    return () => {
      if (currentRenderTask.current) {
        currentRenderTask.current.cancel();
        currentRenderTask.current = null;
      }
    };
  }, [pageNumber, zoom, containerWidth]);

  return (
    <div
      ref={shellRef}
      className="original-page-shell"
      aria-label={`Página ${pageNumber} no formato original`}
      aria-busy={rendering}
    >
      {error && <p role="alert" className="notice">{error}</p>}
      {rendering && !error && (
        <div className="pdf-page-overlay-loading" role="status">
          <span>Carregando pág. {pageNumber}…</span>
        </div>
      )}
      <canvas ref={canvasRef} className="original-page-canvas" />
    </div>
  );
}

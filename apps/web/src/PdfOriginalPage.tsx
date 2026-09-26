import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Cache global de instâncias de PDF para navegação instantânea entre páginas sem re-parsear
const pdfCache = new WeakMap<Blob, Promise<PDFDocumentProxy>>();
type PdfRenderTask = ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>;

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
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const renderRequest = useRef(0);
  const currentRenderTask = useRef<PdfRenderTask | null>(null);

  // Mede a área disponível da página, sem incluir o padding do contêiner.
  useEffect(() => {
    const parent = shellRef.current;
    if (!parent) return;

    const updateWidth = (width: number) => {
      setContainerWidth(Math.max(0, width));
    };

    const styles = getComputedStyle(parent);
    updateWidth(parent.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight));
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) updateWidth(entry.contentRect.width);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  // 2. Carrega o PDF. A renderização espera o estado atualizado de documento e largura.
  useEffect(() => {
    setError("");
    setPdfDoc(null);
    setRendering(true);
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
        if (!cancelled) setPdfDoc(loadedPdf);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Não foi possível abrir o PDF original. Use a visualização Texto.");
          setRendering(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [source]);

  // Função isolada de render da página do PDF
  async function renderPage(pdf: PDFDocumentProxy, num: number, zoomLevel: number, width: number) {
    const canvas = canvasRef.current;
    if (!canvas || !pdf || num < 1 || num > pdf.numPages) return;
    if (width <= 0) {
      setRendering(false);
      return;
    }

    const request = ++renderRequest.current;

    // Cancela qualquer render anterior em andamento
    if (currentRenderTask.current) {
      currentRenderTask.current.cancel();
      currentRenderTask.current = null;
    }

    setRendering(true);
    setError("");

    let page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | undefined;
    let task: PdfRenderTask | null = null;
    try {
      page = await pdf.getPage(num);
      if (request !== renderRequest.current) return;
      const original = page.getViewport({ scale: 1 });
      // Escala base para caber no container com folga confortável
      const baseScale = width / original.width;
      const targetScale = baseScale * (zoomLevel / 100);
      const viewport = page.getViewport({ scale: targetScale });
      const outputScale = Math.min(globalThis.devicePixelRatio || 1, 2);

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;

      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });

      currentRenderTask.current = task;
      await task.promise;
      if (request === renderRequest.current) setRendering(false);
    } catch (err) {
      if (request === renderRequest.current && !(err instanceof Error && err.name === "RenderingCancelledException")) {
        setError("Não foi possível exibir esta página original. Tente novamente.");
        setRendering(false);
      }
    } finally {
      if (currentRenderTask.current === task) currentRenderTask.current = null;
      page?.cleanup();
    }
  }

  // 3. Atualização veloz ao trocar de página, zoom ou largura do container
  useEffect(() => {
    if (!pdfDoc) return;
    if (containerWidth <= 0) {
      setRendering(false);
      return;
    }
    void renderPage(pdfDoc, pageNumber, zoom, containerWidth);

    return () => {
      renderRequest.current += 1;
      if (currentRenderTask.current) {
        currentRenderTask.current.cancel();
        currentRenderTask.current = null;
      }
    };
  }, [pdfDoc, pageNumber, zoom, containerWidth]);

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

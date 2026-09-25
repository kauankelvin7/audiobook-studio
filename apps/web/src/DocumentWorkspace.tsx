import { lazy, Suspense, useRef, useState } from "react";
import type { DocumentIr } from "./schemas/document";
import { StudioIcon } from "./StudioIcon";

const PdfOriginalPage = lazy(async () => ({ default: (await import("./PdfOriginalPage")).PdfOriginalPage }));

type PdfZoomMode = "fit-width" | "fit-page" | "custom";

type Props = {
  document: DocumentIr;
  pageNumber: number;
  onPageChange: (page: number) => void;
  selectedRegion?: string;
  onRegionSelect?: (id: string) => void;
  sourcePdf?: Blob | null;
  reviewMode?: boolean;
  onReviewModeChange?: (enabled: boolean) => void;
};

type ViewerProps = Props & {
  pagePanelOpen?: boolean;
  onPagePanelToggle?: () => void;
};

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 175, 200, 250, 300] as const;

function clampZoom(value: number) {
  return Math.min(300, Math.max(50, Math.round(value)));
}

function ZoomControl({
  viewMode,
  textZoom,
  pdfZoom,
  pdfZoomMode,
  resolvedPdfZoom,
  onTextZoomChange,
  onPdfZoomChange,
  onPdfZoomModeChange,
}: {
  viewMode: "text" | "original";
  textZoom: number;
  pdfZoom: number;
  pdfZoomMode: PdfZoomMode;
  resolvedPdfZoom: number;
  onTextZoomChange: (zoom: number) => void;
  onPdfZoomChange: (zoom: number) => void;
  onPdfZoomModeChange: (mode: PdfZoomMode) => void;
}) {
  const activeZoom = viewMode === "text"
    ? textZoom
    : pdfZoomMode === "custom" ? pdfZoom : resolvedPdfZoom;
  const activeValue = viewMode === "text"
    ? String(textZoom)
    : pdfZoomMode === "custom" ? String(pdfZoom) : pdfZoomMode;
  const presets = viewMode === "text" ? ZOOM_PRESETS.filter(value => value <= 200) : ZOOM_PRESETS;
  const hasActivePreset = presets.includes(activeZoom as (typeof presets)[number]);

  const updateCustom = (value: number) => {
    const next = clampZoom(value);
    if (viewMode === "text") onTextZoomChange(next);
    else {
      onPdfZoomModeChange("custom");
      onPdfZoomChange(next);
    }
  };

  return <div className="zoom-control">
    <button className="icon-button" aria-label="Diminuir zoom" onClick={() => updateCustom(activeZoom - 10)} disabled={activeZoom <= 50}>−</button>
    <select
      className="zoom-select"
      aria-label="Zoom do documento"
      value={activeValue}
      onChange={event => {
        const value = event.target.value;
        if (viewMode === "original" && (value === "fit-width" || value === "fit-page")) {
          onPdfZoomModeChange(value);
          return;
        }
        updateCustom(Number(value));
      }}
    >
      {viewMode === "original" && <>
        <option value="fit-width">{pdfZoomMode === "fit-width" ? `Largura · ${resolvedPdfZoom}%` : "Ajustar à largura"}</option>
        <option value="fit-page">{pdfZoomMode === "fit-page" ? `Página · ${resolvedPdfZoom}%` : "Página inteira"}</option>
      </>}
      {!hasActivePreset && (viewMode === "text" || pdfZoomMode === "custom") && <option value={String(activeZoom)}>{activeZoom}%</option>}
      {presets.map(value => <option key={value} value={String(value)}>{value}%</option>)}
    </select>
    <button className="icon-button" aria-label="Aumentar zoom" onClick={() => updateCustom(activeZoom + 10)} disabled={activeZoom >= 300 || (viewMode === "text" && activeZoom >= 200)}>+</button>
  </div>;
}

export function PageNavigator({ document, pageNumber, onPageChange }: Props) {
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const pending = document.pages.filter(page => page.textQuality === "needs_ocr").length;
  const pages = document.pages.filter(page => (!pendingOnly || page.textQuality === "needs_ocr")
    && (!query || `${page.number} ${page.rawText}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));

  return <aside className="page-rail" aria-label="Páginas do documento">
    <div className="result-heading"><h2 id="result-title">Páginas</h2><span className="status-badge warning">{pending ? `${pending} sem texto` : `${document.pages.length} páginas`}</span></div>
    <div className="page-search"><StudioIcon name="search" size={17} /><input aria-label="Buscar página ou conteúdo" placeholder="Buscar página ou conteúdo…" value={query} onChange={event => setQuery(event.target.value)} /><button className="icon-button" aria-label="Mostrar páginas que precisam de OCR" aria-pressed={pendingOnly} onClick={() => setPendingOnly(!pendingOnly)}><StudioIcon name="review" size={18} /></button></div>
    <ol>{pages.map(page => {
      const title = page.blocks.find(block => block.type === "heading")?.text || page.blocks[0]?.text || "Página sem texto";
      return <li key={page.number}><button type="button" className={`page-nav-item${pageNumber === page.number ? " selected" : ""}`} onClick={() => onPageChange(page.number)} aria-label={`Página ${page.number}`} aria-current={pageNumber === page.number ? "page" : undefined}>
        <span className="page-nav-number">{String(page.number).padStart(2, "0")}</span>
        <span className={`page-quality ${page.textQuality === "needs_ocr" ? "warning" : "neutral"}`}><StudioIcon name={page.textQuality === "needs_ocr" ? "warning" : "document"} size={17} /></span>
        <span className="page-nav-copy"><small>p. {page.number}</small><strong title={title}>{title.slice(0, 110)}</strong><small className={page.textQuality === "needs_ocr" ? "warning-text" : ""}>{page.textQuality === "needs_ocr" ? "Precisa de OCR" : "Texto extraído"}</small></span>
      </button></li>;
    })}</ol>
    {pages.length === 0 && <p className="footnote">Nenhuma página encontrada.</p>}
  </aside>;
}

export function DocumentViewer({
  document,
  pageNumber,
  onPageChange,
  selectedRegion,
  onRegionSelect,
  sourcePdf,
  reviewMode = true,
  onReviewModeChange,
  pagePanelOpen = false,
  onPagePanelToggle,
}: ViewerProps) {
  const [textZoom, setTextZoom] = useState(100);
  const [pdfZoom, setPdfZoom] = useState(100);
  const [pdfZoomMode, setPdfZoomMode] = useState<PdfZoomMode>("fit-width");
  const [resolvedPdfZoom, setResolvedPdfZoom] = useState(100);
  const [viewMode, setViewMode] = useState<"text" | "original">("text");
  const viewer = useRef<HTMLDivElement>(null);
  const selectedPage = document.pages.find(page => page.number === pageNumber) ?? document.pages[0];

  return <div className="document-canvas" ref={viewer}>
    <div className="document-toolbar">
      <div className="toolbar-navigation">
        <button className="icon-button page-panel-button" aria-label={pagePanelOpen ? "Ocultar páginas" : "Mostrar páginas"} aria-expanded={pagePanelOpen} onClick={onPagePanelToggle}><StudioIcon name="document" size={17} /></button>
        <div className="page-arrows">
          <button className="icon-button" onClick={() => onPageChange(Math.max(1, pageNumber - 1))} disabled={pageNumber <= 1} aria-label="Página anterior">‹</button>
          <button className="icon-button" onClick={() => onPageChange(Math.min(document.pages.length, pageNumber + 1))} disabled={pageNumber >= document.pages.length} aria-label="Próxima página">›</button>
        </div>
        <span className="page-counter"><span>Página </span>{pageNumber} <span>de {document.pages.length}</span></span>
      </div>

      <div className="viewer-mode" role="group" aria-label="Visualização do documento">
        <button type="button" aria-pressed={viewMode === "text"} onClick={() => setViewMode("text")}>Texto</button>
        <button type="button" aria-pressed={viewMode === "original"} disabled={!sourcePdf} onClick={() => setViewMode("original")}>Original</button>
      </div>

      <div className="viewer-tools">
        <ZoomControl
          viewMode={viewMode}
          textZoom={textZoom}
          pdfZoom={pdfZoom}
          pdfZoomMode={pdfZoomMode}
          resolvedPdfZoom={resolvedPdfZoom}
          onTextZoomChange={setTextZoom}
          onPdfZoomChange={setPdfZoom}
          onPdfZoomModeChange={setPdfZoomMode}
        />
        <button className="icon-button fullscreen-button" aria-label="Expandir documento" onClick={() => {
          if (globalThis.document.fullscreenElement) void globalThis.document.exitFullscreen();
          else void viewer.current?.requestFullscreen().catch(() => {});
        }}><StudioIcon name="fullscreen" size={17} /></button>
        <label className="review-toggle" title={reviewMode ? "Sair do modo de revisão" : "Ativar modo de revisão"}><StudioIcon name="book" size={17} /><span>Modo de revisão</span><input aria-label="Modo de revisão" type="checkbox" checked={reviewMode} onChange={event => onReviewModeChange?.(event.target.checked)} /></label>
      </div>
    </div>

    <div className="paper-scroll">
      {viewMode === "original" && sourcePdf
        ? <div className="page-view original-view" key={`original-${pageNumber}`}><Suspense fallback={<div className="original-page-shell" aria-busy="true" />}>
            <PdfOriginalPage
              source={sourcePdf}
              pageNumber={pageNumber}
              zoom={pdfZoom}
              zoomMode={pdfZoomMode}
              onResolvedZoom={setResolvedPdfZoom}
            />
          </Suspense></div>
        : <div className="page-view text-view" key={`text-${pageNumber}`}><article className="page" style={{ fontSize: `${18 * textZoom / 100}px` }} aria-labelledby={`page-${selectedPage.number}`}>
          <p className="paper-eyebrow" id={`page-${selectedPage.number}`}>PÁGINA {selectedPage.number}</p>
          {selectedPage.textQuality === "needs_ocr"
            ? <p className="notice">Esta página não tem texto selecionável. Use o OCR para conferir seu conteúdo.</p>
            : <div className="blocks">{selectedPage.blocks.map(block => <div
                key={block.id}
                className={`document-block${reviewMode && selectedRegion === block.id ? " selected" : ""}`}
                tabIndex={reviewMode ? 0 : undefined}
                role={reviewMode ? "button" : undefined}
                aria-label={reviewMode ? `Selecionar trecho: ${block.text.slice(0, 60)}` : undefined}
                onClick={() => { if (reviewMode) onRegionSelect?.(block.id); }}
                onKeyDown={event => {
                  if (reviewMode && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onRegionSelect?.(block.id);
                  }
                }}
              >
                {block.type === "heading" ? <h2>{block.text}</h2> : block.type === "code" ? <pre><code>{block.text}</code></pre> : <p>{block.text}</p>}
              </div>)}</div>}
        </article></div>}
    </div>
  </div>;
}

export function DocumentWorkspace(props: Props) {
  const [pagePanelOpen, setPagePanelOpen] = useState(false);
  return <div className={`result document-workspace${pagePanelOpen ? " pages-open" : ""}`} aria-labelledby="result-title">
    <PageNavigator {...props} />
    <DocumentViewer {...props} pagePanelOpen={pagePanelOpen} onPagePanelToggle={() => setPagePanelOpen(open => !open)} />
  </div>;
}

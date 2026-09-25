import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { DocumentIr } from "./schemas/document";
import { StudioIcon } from "./StudioIcon";

const PdfOriginalPage = lazy(async () => ({ default: (await import("./PdfOriginalPage")).PdfOriginalPage }));

type Props = {
  document: DocumentIr;
  pageNumber: number;
  onPageChange: (page: number) => void;
  selectedRegion?: string;
  onRegionSelect?: (id: string) => void;
  sourcePdf?: Blob | null;
  readingMode?: boolean;
  onReadingModeChange?: (enabled: boolean) => void;
};

export function PageNavigator({ document, pageNumber, onPageChange }: Props) {
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const pending = document.pages.filter(page => page.textQuality === "needs_ocr").length;
  const pages = document.pages.filter(page => (!pendingOnly || page.textQuality === "needs_ocr") && (!query || `${page.number} ${page.rawText}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const selectedButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = selectedButton.current;
    const list = button?.closest("ol");
    if (!button || !list) return;
    const item = button.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
    if (item.left < bounds.left) list.scrollLeft -= bounds.left - item.left;
    else if (item.right > bounds.right) list.scrollLeft += item.right - bounds.right;
  }, [pageNumber]);
  return <aside className="page-rail" aria-label="Páginas do documento">
    <div className="result-heading"><div><p className="section-kicker">DOCUMENTO</p><h2 id="result-title">Páginas</h2></div><span className="count-badge">{document.pages.length}</span></div>
    <div className="page-search"><StudioIcon name="search" size={17} /><input aria-label="Buscar página ou conteúdo" placeholder="Buscar no documento" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="page-filter" role="group" aria-label="Filtrar páginas"><button type="button" aria-pressed={!pendingOnly} onClick={() => setPendingOnly(false)}>Todas</button><button type="button" aria-pressed={pendingOnly} onClick={() => setPendingOnly(true)}>Revisar <span>{pending}</span></button></div>
    <ol>{pages.map(page => {
      const title = page.blocks.find(block => block.type === "heading" && block.text.trim().length > 3)?.text
        || page.blocks.find(block => block.text.trim().length > 3)?.text || "Página sem texto";
      const selected = pageNumber === page.number;
      return <li key={page.number}><button ref={selected ? selectedButton : undefined} type="button" className={`page-nav-item${selected ? " selected" : ""}`} onClick={() => onPageChange(page.number)} aria-label={`Página ${page.number}`} aria-current={selected ? "page" : undefined}>
        <span className="page-thumbnail" aria-hidden="true"><span>{String(page.number).padStart(2,"0")}</span><i /><i /><i /></span>
        <span className="page-nav-copy"><small>Página {page.number}</small><strong title={title}>{title.slice(0,160)}</strong><span className={`page-state ${page.textQuality === "needs_ocr" ? "warning-text" : ""}`}><StudioIcon name={page.textQuality === "needs_ocr" ? "warning" : "check"} size={13} />{page.textQuality === "needs_ocr" ? "Precisa de revisão" : "Texto disponível"}</span></span>
      </button></li>;
    })}</ol>{pages.length === 0 && <p className="page-search-empty">Nenhuma página encontrada. Tente outra palavra ou volte para todas as páginas.</p>}
    <div className="page-rail-footer">{pages.length} {pages.length === 1 ? "página" : "páginas"} · seleção {pageNumber}</div>
  </aside>;
}

export function DocumentViewer({ document, pageNumber, onPageChange, selectedRegion, onRegionSelect, sourcePdf, readingMode = false, onReadingModeChange }: Props) {
  const [zoom, setZoom] = useState(100);
  const [readingTheme, setReadingTheme] = useState<"default" | "paper" | "sepia" | "night">("default");
  const [readerWidth, setReaderWidth] = useState<"standard" | "wide">("standard");
  const review = !readingMode;
  const [viewMode, setViewMode] = useState<"text" | "original">("text");
  const viewer = useRef<HTMLDivElement>(null);
  const selectedPage = document.pages.find(page => page.number === pageNumber) ?? document.pages[0];
  const totalPages = document.pages.length;
  const progressPercent = totalPages > 0 ? Math.round((pageNumber / totalPages) * 100) : 0;

  useEffect(() => {
    if (!readingMode) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        onPageChange(Math.max(1, pageNumber - 1));
      } else if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        onPageChange(Math.min(totalPages, pageNumber + 1));
      } else if (event.key === "Escape") {
        onReadingModeChange?.(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readingMode, pageNumber, totalPages, onPageChange, onReadingModeChange]);

  return <div className={`document-canvas${readingMode ? ` reading-active reader-theme-${readingTheme} reader-width-${readerWidth}` : ""}`} ref={viewer}>
    {readingMode && <div className="reader-top-progress" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso de leitura">
      <div className="reader-top-progress-bar" style={{ width: `${progressPercent}%` }} />
    </div>}
    <div className={`document-toolbar${readingMode ? " reader-toolbar" : ""}`}>
      <div className="page-arrows">
        <button className="icon-button" onClick={() => onPageChange(Math.max(1, pageNumber - 1))} disabled={pageNumber <= 1} aria-label="Página anterior">‹</button>
        <button className="icon-button" onClick={() => onPageChange(Math.min(totalPages, pageNumber + 1))} disabled={pageNumber >= totalPages} aria-label="Próxima página">›</button>
      </div>
      <span className="page-counter">Página {pageNumber} de {totalPages}{readingMode ? ` · ${progressPercent}%` : ""}</span>

      <div className="viewer-mode" role="group" aria-label="Visualização do documento">
        <button type="button" aria-pressed={viewMode === "text"} onClick={() => setViewMode("text")}>Texto</button>
        <button type="button" aria-pressed={viewMode === "original"} disabled={!sourcePdf} onClick={() => setViewMode("original")}>Original</button>
      </div>

      {readingMode && <div className="reader-theme-selector" role="group" aria-label="Tema de leitura">
        <button type="button" className={`theme-btn theme-default${readingTheme === "default" ? " active" : ""}`} title="Tema padrão escuro" onClick={() => setReadingTheme("default")}>Escuro</button>
        <button type="button" className={`theme-btn theme-paper${readingTheme === "paper" ? " active" : ""}`} title="Tema papel suave" onClick={() => setReadingTheme("paper")}>Papel</button>
        <button type="button" className={`theme-btn theme-sepia${readingTheme === "sepia" ? " active" : ""}`} title="Tema sépia acolhedor" onClick={() => setReadingTheme("sepia")}>Sépia</button>
        <button type="button" className={`theme-btn theme-night${readingTheme === "night" ? " active" : ""}`} title="Tema noturno alto contraste" onClick={() => setReadingTheme("night")}>Noite</button>
      </div>}

      <div className="viewer-tools">
        <button className="icon-button" aria-label="Diminuir zoom" onClick={() => setZoom(Math.max(70, zoom - 10))} disabled={zoom <= 70}>−</button>
        <output aria-label="Zoom do documento">{zoom}%</output>
        <button className="icon-button" aria-label="Aumentar zoom" onClick={() => setZoom(Math.min(200, zoom + 10))} disabled={zoom >= 200}>+</button>

        {readingMode && <button className="icon-button" type="button" aria-label={readerWidth === "standard" ? "Expandir largura do texto" : "Largura padrão"} title={readerWidth === "standard" ? "Texto expandido" : "Texto padrão"} onClick={() => setReaderWidth(w => w === "standard" ? "wide" : "standard")}>
          <StudioIcon name="text" size={16} />
        </button>}

        <button className="icon-button" aria-label="Expandir documento" onClick={() => { if (globalThis.document.fullscreenElement) void globalThis.document.exitFullscreen(); else void viewer.current?.requestFullscreen().catch(() => {}); }}>
          <StudioIcon name="fullscreen" size={17} />
        </button>

        {readingMode ? <button type="button" className="exit-reading-pill" onClick={() => onReadingModeChange?.(false)} aria-label="Sair do modo leitura">
          <StudioIcon name="close" size={14} />
          <span>Sair da leitura</span>
        </button> : <label className="review-toggle">
          <StudioIcon name="book" size={17} />
          <span>Modo leitura</span>
          <input aria-label="Modo leitura" type="checkbox" checked={readingMode} onChange={event => {
            if (event.target.checked) {
              setViewMode(sourcePdf ? "original" : "text");
              setZoom(100);
            }
            onReadingModeChange?.(event.target.checked);
          }} />
        </label>}
      </div>
    </div>

    <div className="paper-scroll">
      {readingMode && pageNumber > 1 && <button type="button" className="floating-page-arrow prev" aria-label="Ir para página anterior" onClick={() => onPageChange(pageNumber - 1)} title="Página anterior (←)">
        ‹
      </button>}
      {readingMode && pageNumber < totalPages && <button type="button" className="floating-page-arrow next" aria-label="Ir para próxima página" onClick={() => onPageChange(pageNumber + 1)} title="Próxima página (→)">
        ›
      </button>}

      {viewMode === "original" && sourcePdf
        ? <div className="page-view original-view" key={`original-${pageNumber}`}><Suspense fallback={<div className="original-page-shell" aria-busy="true" />}>
            <PdfOriginalPage source={sourcePdf} pageNumber={pageNumber} zoom={zoom} />
          </Suspense></div>
        : <div className="page-view text-view" key={`text-${pageNumber}`}><article className={`page${readingMode ? " reading-article" : ""}`} style={{ fontSize: `${18 * zoom / 100}px` }} aria-labelledby={`page-${selectedPage.number}`}><p className="paper-eyebrow" id={`page-${selectedPage.number}`}>PÁGINA {selectedPage.number}</p>{selectedPage.textQuality === "needs_ocr" ? <p className="notice">Esta página não tem texto selecionável. Use o OCR para conferir seu conteúdo.</p> : <div className="blocks">{selectedPage.blocks.map(block => <div key={block.id} className={`document-block${review && selectedRegion === block.id ? " selected" : ""}`} tabIndex={review ? 0 : undefined} role={review ? "button" : undefined} aria-label={review ? `Selecionar trecho: ${block.text.slice(0, 60)}` : undefined} onClick={() => { if (review) onRegionSelect?.(block.id); }} onKeyDown={event => { if (review && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRegionSelect?.(block.id); } }}>
          {block.type === "heading" ? <h2>{block.text}</h2> : block.type === "code" ? <pre><code>{block.text}</code></pre> : <p>{block.text}</p>}
        </div>)}</div>}</article></div>}
    </div>
  </div>;
}

export function DocumentWorkspace(props: Props) { return <div className="result document-workspace" aria-labelledby="result-title"><PageNavigator {...props}/><DocumentViewer {...props}/></div>; }

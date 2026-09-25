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
  const review = !readingMode;
  const [viewMode, setViewMode] = useState<"text" | "original">("text");
  const viewer = useRef<HTMLDivElement>(null);
  const selectedPage = document.pages.find(page => page.number === pageNumber) ?? document.pages[0];

  return <div className="document-canvas" ref={viewer}><div className="document-toolbar"><div className="page-arrows"><button className="icon-button" onClick={() => onPageChange(Math.max(1,pageNumber-1))} disabled={pageNumber <= 1} aria-label="Página anterior">‹</button><button className="icon-button" onClick={() => onPageChange(Math.min(document.pages.length,pageNumber+1))} disabled={pageNumber >= document.pages.length} aria-label="Próxima página">›</button></div><span className="page-counter">Página {pageNumber} de {document.pages.length}</span>
    <div className="viewer-mode" role="group" aria-label="Visualização do documento">
      <button type="button" aria-pressed={viewMode === "text"} onClick={() => setViewMode("text")}>Texto</button>
      <button type="button" aria-pressed={viewMode === "original"} disabled={!sourcePdf} onClick={() => setViewMode("original")}>Original</button>
    </div>
    <div className="viewer-tools"><button className="icon-button" aria-label="Diminuir zoom" onClick={() => setZoom(Math.max(70,zoom-10))} disabled={zoom <= 70}>−</button><output aria-label="Zoom do documento">{zoom}%</output><button className="icon-button" aria-label="Aumentar zoom" onClick={() => setZoom(Math.min(200,zoom+10))} disabled={zoom >= 200}>+</button><button className="icon-button" aria-label="Expandir documento" onClick={() => { if (globalThis.document.fullscreenElement) void globalThis.document.exitFullscreen(); else void viewer.current?.requestFullscreen().catch(() => {}); }}><StudioIcon name="fullscreen" size={17} /></button><label className="review-toggle"><StudioIcon name="book" size={17} /><span>Modo leitura</span><input aria-label="Modo leitura" type="checkbox" checked={readingMode} onChange={event => { if (event.target.checked) { setViewMode(sourcePdf ? "original" : "text"); setZoom(100); } onReadingModeChange?.(event.target.checked); }} /></label></div></div>
    <div className="paper-scroll">
      {viewMode === "original" && sourcePdf
        ? <div className="page-view original-view" key={`original-${pageNumber}`}><Suspense fallback={<div className="original-page-shell" aria-busy="true" />}>
            <PdfOriginalPage source={sourcePdf} pageNumber={pageNumber} zoom={zoom} />
          </Suspense></div>
        : <div className="page-view text-view" key={`text-${pageNumber}`}><article className="page" style={{fontSize: `${18*zoom/100}px`}} aria-labelledby={`page-${selectedPage.number}`}><p className="paper-eyebrow" id={`page-${selectedPage.number}`}>PÁGINA {selectedPage.number}</p>{selectedPage.textQuality === "needs_ocr" ? <p className="notice">Esta página não tem texto selecionável. Use o OCR para conferir seu conteúdo.</p> : <div className="blocks">{selectedPage.blocks.map(block => <div key={block.id} className={`document-block${review && selectedRegion === block.id ? " selected" : ""}`} tabIndex={review ? 0 : undefined} role={review ? "button" : undefined} aria-label={review ? `Selecionar trecho: ${block.text.slice(0,60)}` : undefined} onClick={() => { if (review) onRegionSelect?.(block.id); }} onKeyDown={event => { if (review && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRegionSelect?.(block.id); } }}>
          {block.type === "heading" ? <h2>{block.text}</h2> : block.type === "code" ? <pre><code>{block.text}</code></pre> : <p>{block.text}</p>}
        </div>)}</div>}</article></div>}
    </div>
  </div>;
}

export function DocumentWorkspace(props: Props) { return <div className="result document-workspace" aria-labelledby="result-title"><PageNavigator {...props}/><DocumentViewer {...props}/></div>; }

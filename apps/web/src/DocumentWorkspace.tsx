import { lazy, Suspense, useRef, useState } from "react";
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
};

export function PageNavigator({ document, pageNumber, onPageChange }: Props) {
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const pending = document.pages.filter(page => page.textQuality === "needs_ocr").length;
  const pages = document.pages.filter(page => (!pendingOnly || page.textQuality === "needs_ocr") && (!query || `${page.number} ${page.rawText}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  return <aside className="page-rail" aria-label="Páginas do documento"><div className="result-heading"><h2 id="result-title">Páginas</h2><span className="status-badge warning">{pending ? `${pending} sem texto` : `${document.pages.length} páginas`}</span></div>
    <div className="page-search"><StudioIcon name="search" size={17} /><input aria-label="Buscar página ou conteúdo" placeholder="Buscar página ou conteúdo…" value={query} onChange={event => setQuery(event.target.value)} /><button className="icon-button" aria-label="Mostrar páginas que precisam de OCR" aria-pressed={pendingOnly} onClick={() => setPendingOnly(!pendingOnly)}><StudioIcon name="review" size={18} /></button></div>
    <ol>{pages.map(page => { const title = page.blocks.find(block => block.type === "heading")?.text || page.blocks[0]?.text || "Página sem texto"; return <li key={page.number}><button type="button" className={`page-nav-item${pageNumber === page.number ? " selected" : ""}`} onClick={() => onPageChange(page.number)} aria-label={`Página ${page.number}`} aria-current={pageNumber === page.number ? "page" : undefined}><span className="page-nav-number">{String(page.number).padStart(2,"0")}</span><span className={`page-quality ${page.textQuality === "needs_ocr" ? "warning" : "neutral"}`}><StudioIcon name={page.textQuality === "needs_ocr" ? "warning" : "document"} size={17} /></span><span className="page-nav-copy"><small>p. {page.number}</small><strong title={title}>{title.slice(0,110)}</strong><small className={page.textQuality === "needs_ocr" ? "warning-text" : ""}>{page.textQuality === "needs_ocr" ? "Precisa de OCR" : "Texto extraído"}</small></span></button></li>; })}</ol>{pages.length === 0 && <p className="footnote">Nenhuma página encontrada.</p>}
  </aside>;
}

export function DocumentViewer({ document, pageNumber, onPageChange, selectedRegion, onRegionSelect, sourcePdf }: Props) {
  const [zoom, setZoom] = useState(100);
  const [review, setReview] = useState(true);
  const [viewMode, setViewMode] = useState<"text" | "original">("text");
  const viewer = useRef<HTMLDivElement>(null);
  const selectedPage = document.pages.find(page => page.number === pageNumber) ?? document.pages[0];

  return <div className="document-canvas" ref={viewer}><div className="document-toolbar">
    <div className="toolbar-navigation"><div className="page-arrows"><button className="icon-button" onClick={() => onPageChange(Math.max(1,pageNumber-1))} disabled={pageNumber <= 1} aria-label="Página anterior">‹</button><button className="icon-button" onClick={() => onPageChange(Math.min(document.pages.length,pageNumber+1))} disabled={pageNumber >= document.pages.length} aria-label="Próxima página">›</button></div><span className="page-counter"><span>Página </span>{pageNumber} <span>de {document.pages.length}</span></span></div>
    <div className="toolbar-actions">
      <div className="viewer-mode" role="group" aria-label="Visualização do documento">
        <button type="button" aria-pressed={viewMode === "text"} onClick={() => setViewMode("text")}>Texto</button>
        <button type="button" aria-pressed={viewMode === "original"} disabled={!sourcePdf} onClick={() => setViewMode("original")}>Original</button>
      </div>
      <div className="viewer-tools"><div className="zoom-control"><button className="icon-button" aria-label="Diminuir zoom" onClick={() => setZoom(Math.max(70,zoom-10))} disabled={zoom <= 70}>−</button><output aria-label="Zoom do documento">{zoom}%</output><button className="icon-button" aria-label="Aumentar zoom" onClick={() => setZoom(Math.min(200,zoom+10))} disabled={zoom >= 200}>+</button></div><button className="icon-button fullscreen-button" aria-label="Expandir documento" onClick={() => { if (globalThis.document.fullscreenElement) void globalThis.document.exitFullscreen(); else void viewer.current?.requestFullscreen().catch(() => {}); }}><StudioIcon name="fullscreen" size={17} /></button><label className="review-toggle" title="Modo de revisão"><StudioIcon name="book" size={17} /><span>Modo de revisão</span><input aria-label="Modo de revisão" type="checkbox" checked={review} onChange={event => setReview(event.target.checked)} /></label></div>
    </div>
  </div>
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

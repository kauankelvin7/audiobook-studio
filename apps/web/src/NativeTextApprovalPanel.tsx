import { useState } from "react";
import type { LocalProjectPersistence } from "./adapters/local_project_persistence";
import { saveApprovedNative } from "./adapters/canonical_native";
import { userError } from "./adapters/user_error";
import type { DocumentIrV2 } from "./schemas/ingestion";
import { StudioIcon } from "./StudioIcon";

export function NativeTextApprovalPanel({ document, persistence, onApproved }: {
  document: DocumentIrV2;
  persistence: LocalProjectPersistence | null;
  onApproved: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [reviewPage, setReviewPage] = useState(document.pages[0]?.number ?? 1);
  const [approved, setApproved] = useState(false);

  async function approve() {
    if (!persistence || !confirmed || busy) return;
    setBusy(true);
    setStatus("");
    try {
      await saveApprovedNative(persistence, document);
      setStatus("Texto nativo aprovado. O roteiro preliminar está disponível em Narrativa.");
      setApproved(true);
      onApproved();
    } catch (error) {
      setStatus(userError(error, "Não foi possível aprovar o texto. Confira as páginas e tente novamente."));
    } finally { setBusy(false); }
  }

  const pending = document.pages.filter(page => page.extractionQuality !== "good").length;
  const selectedPage = document.pages.find(page => page.number === reviewPage);
  return <section className="panel native-approval-panel" aria-labelledby="native-approval-title">
    <header className="approval-heading"><span className="approval-icon"><StudioIcon name={approved ? "check" : "review"} /></span><div><h2 id="native-approval-title">{approved ? "Texto aprovado" : "Aprovar texto do PDF"}</h2><p>{document.pages.length - pending} de {document.pages.length} páginas com texto</p></div></header>
    <p className="approval-description">Confira o texto extraído antes de preparar a narração.</p>
    {pending > 0 && <p className="notice">{pending} {pending === 1 ? "página precisa" : "páginas precisam"} de revisão. Use o OCR para conferir o conteúdo antes de aprovar.</p>}
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary><span>Conferir texto por página</span><StudioIcon name="document" size={17} /></summary>
      <label htmlFor="approval-page">Página para conferir</label>
      <select id="approval-page" value={reviewPage} onChange={event => setReviewPage(Number(event.target.value))}>{document.pages.map(page => <option key={page.number} value={page.number}>Página {page.number}{page.extractionQuality === "good" ? "" : " · revisão necessária"}</option>)}</select>
      <div className="approval-page-text">{selectedPage?.regions.length ? selectedPage.regions.map(region => <p key={region.id}>{region.sources.rawText ?? "Sem texto extraído"}</p>) : <p>Esta página precisa de OCR para recuperar o texto.</p>}</div>
    </details>
    <div className="approval-actions">
    <label className="check-label"><input type="checkbox" checked={confirmed}
      onChange={event => setConfirmed(event.target.checked)} />Conferi o texto de todas as páginas com o PDF.</label>
    <button className="primary" type="button" disabled={busy || !confirmed || !persistence || pending > 0 || approved} onClick={() => void approve()}>
      {busy ? "Aprovando texto…" : "Aprovar texto nativo do PDF para análise"}
    </button>
    {approved && <a className="button-link primary" href="#narrative">Abrir roteiro narrativo</a>}
    {status && <p role="status">{status}</p>}
    </div>
  </section>;
}

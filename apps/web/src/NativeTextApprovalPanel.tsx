import { useState } from "react";
import type { LocalProjectPersistence } from "./adapters/local_project_persistence";
import { saveApprovedNative } from "./adapters/canonical_native";
import { userError } from "./adapters/user_error";
import type { DocumentIrV2 } from "./schemas/ingestion";

export function NativeTextApprovalPanel({ document, persistence, onApproved }: {
  document: DocumentIrV2;
  persistence: LocalProjectPersistence | null;
  onApproved: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(() => !window.location.hash.includes("#review"));

  async function approve() {
    if (!persistence || !confirmed || busy) return;
    setBusy(true);
    setStatus("");
    try {
      await saveApprovedNative(persistence, document);
      setStatus("Texto nativo aprovado. O roteiro preliminar está disponível em Narrativa.");
      onApproved();
    } catch (error) {
      setStatus(userError(error, "Não foi possível aprovar o texto. Confira as páginas e tente novamente."));
    } finally { setBusy(false); }
  }

  const pending = document.pages.filter(page => page.extractionQuality !== "good").length;
  return <section className="panel native-approval-panel" aria-labelledby="native-approval-title">
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary><span><strong id="native-approval-title">Aprovar texto do PDF</strong><small>{document.pages.length - pending} de {document.pages.length} páginas com texto</small></span><span className={pending ? "warning-text" : "success-text"}>{pending ? `${pending} pendências` : "Pronto para conferir"}</span></summary>
      <p>Confira as páginas com texto selecionável. Páginas vazias, corrompidas ou com conteúdo estruturado exigem revisão específica.</p>
    {document.pages.map(page => <details key={page.number}>
      <summary>Página {page.number} · {page.extractionQuality === "good" ? "texto encontrado" : "revisão necessária"}</summary>
      {page.regions.map(region => <p key={region.id}>{region.sources.rawText ?? "Sem texto nativo"}</p>)}
    </details>)}
    <label className="check-label"><input type="checkbox" checked={confirmed}
      onChange={event => setConfirmed(event.target.checked)} />Conferi o texto de todas as páginas com o PDF.</label>
    <button type="button" disabled={busy || !confirmed || !persistence} onClick={() => void approve()}>
      {busy ? "Aprovando texto…" : "Aprovar texto nativo do PDF para análise"}
    </button>
    <p className="footnote">Para páginas digitalizadas ou ambíguas, use a comparação OCR nesta etapa.</p>
    {status && <p role="status">{status}</p>}
    </details>
  </section>;
}

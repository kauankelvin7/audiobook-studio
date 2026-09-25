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
  const [expanded, setExpanded] = useState(false);

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

  const pendingPages = document.pages.filter(page => page.extractionQuality !== "good");
  const approvedCount = document.pages.length - pendingPages.length;
  const pending = pendingPages.length;

  return <section className="panel native-approval-panel" aria-labelledby="native-approval-title">
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary className="native-approval-summary">
        <span className="native-approval-copy"><strong id="native-approval-title">Texto do PDF</strong><small>{approvedCount} de {document.pages.length} páginas com texto selecionável</small></span>
        <span className={`native-approval-state ${pending ? "warning-text" : "success-text"}`}>{pending ? `${pending} para revisar` : "Pronto"}</span>
      </summary>

      <div className="native-approval-body">
        <div className="native-progress" aria-label={`${approvedCount} de ${document.pages.length} páginas com texto selecionável`}>
          <span style={{ width: `${document.pages.length ? (approvedCount / document.pages.length) * 100 : 0}%` }} />
        </div>
        <p className="native-approval-help">{pending
          ? `O texto foi encontrado em ${approvedCount} páginas. Revise apenas ${pending === 1 ? "a pendência abaixo" : "as pendências abaixo"} antes de continuar.`
          : "O texto selecionável está disponível em todas as páginas. Faça uma conferência geral no documento antes de aprovar."}</p>

        {pending > 0 && <div className="native-pending-list" aria-label="Páginas que precisam de revisão">
          <div className="native-pending-heading"><strong>Precisa de atenção</strong><span>{pending}</span></div>
          {pendingPages.map(page => <details className="native-pending-item" key={page.number}>
            <summary><span>Página {page.number}</span><small>Revisão necessária</small></summary>
            {page.regions.length > 0
              ? page.regions.map(region => <p key={region.id}>{region.sources.rawText ?? "Sem texto nativo"}</p>)
              : <p>Não há texto selecionável nesta página. Use a revisão OCR quando necessário.</p>}
          </details>)}
        </div>}

        <div className="native-approval-actions">
          <label className="check-label"><input type="checkbox" checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)} />Conferi o texto disponível no documento.</label>
          <button type="button" disabled={busy || !confirmed || !persistence} onClick={() => void approve()}>
            {busy ? "Aprovando…" : "Aprovar texto para análise"}
          </button>
        </div>
        <p className="footnote">Páginas digitalizadas ou ambíguas continuam sendo tratadas na comparação OCR.</p>
        {status && <p role="status">{status}</p>}
      </div>
    </details>
  </section>;
}

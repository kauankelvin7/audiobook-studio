import { useState } from "react";
import type { LocalProjectPersistence } from "./adapters/local_project_persistence";
import { saveApprovedNative } from "./adapters/canonical_native";
import { userError } from "./adapters/user_error";
import type { DocumentIrV2 } from "./schemas/ingestion";
import { StudioIcon } from "./StudioIcon";

export function NativeTextApprovalPanel({
  document,
  persistence,
  onApproved,
}: {
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
      setStatus("Texto nativo aprovado com sucesso. O roteiro narrativo preliminar já está disponível.");
      setApproved(true);
      onApproved();
    } catch (error) {
      setStatus(userError(error, "Não foi possível aprovar o texto. Confira as páginas e tente novamente."));
    } finally {
      setBusy(false);
    }
  }

  const pending = document.pages.filter(page => page.extractionQuality !== "good").length;
  const selectedPage = document.pages.find(page => page.number === reviewPage);

  return (
    <section className="panel native-approval-panel" aria-labelledby="native-approval-title">
      <header className="approval-heading">
        <span className="approval-icon">
          <StudioIcon name={approved ? "check" : "review"} />
        </span>
        <div>
          <h2 id="native-approval-title">
            {approved ? "Texto nativo aprovado" : "Aprovar texto do PDF"}
          </h2>
          <p className="approval-sub">
            {document.pages.length - pending} de {document.pages.length} páginas com extração direta
          </p>
        </div>
      </header>

      <p className="approval-description">
        Ao aprovar o texto nativo do documento, o sistema habilita a análise narrativa e criação de capítulos no estúdio.
      </p>

      {pending > 0 && (
        <p className="notice">
          {pending} {pending === 1 ? "página precisa" : "páginas precisam"} de revisão ou OCR antes da aprovação total.
        </p>
      )}

      <details
        className="approval-details-box"
        open={expanded}
        onToggle={event => setExpanded(event.currentTarget.open)}
      >
        <summary>
          <span>Conferir texto extraído página por página</span>
          <StudioIcon name="document" size={16} />
        </summary>
        <div className="approval-details-body">
          <div className="field-group">
            <label htmlFor="approval-page">Selecione a página</label>
            <select
              id="approval-page"
              value={reviewPage}
              onChange={event => setReviewPage(Number(event.target.value))}
            >
              {document.pages.map(page => (
                <option key={page.number} value={page.number}>
                  Página {page.number}
                  {page.extractionQuality === "good" ? " (texto limpo)" : " · revisão necessária"}
                </option>
              ))}
            </select>
          </div>

          <div className="approval-page-text">
            {selectedPage?.regions.length ? (
              selectedPage.regions.map(region => (
                <p key={region.id}>{region.sources.rawText ?? "Sem texto extraído"}</p>
              ))
            ) : (
              <p className="empty-region-msg">Esta página requer OCR para recuperação do texto.</p>
            )}
          </div>
        </div>
      </details>

      <div className="approval-actions-card">
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)}
          />
          <span>Conferi o texto extraído de todas as páginas com o PDF original.</span>
        </label>

        <div className="approval-btn-row">
          <button
            className="primary approve-btn"
            type="button"
            disabled={busy || !confirmed || !persistence || pending > 0 || approved}
            onClick={() => void approve()}
          >
            <StudioIcon name={approved ? "check" : "review"} size={17} />
            <span>
              {busy
                ? "Aprovando texto…"
                : approved
                  ? "Texto nativo já aprovado"
                  : "Aprovar texto nativo do PDF para análise"}
            </span>
          </button>

          {approved && (
            <a className="button-link primary" href="#narrative">
              <span>Abrir roteiro narrativo</span>
              <StudioIcon name="chevron" size={15} />
            </a>
          )}
        </div>

        {status && (
          <p role="status" className="approval-status-msg">
            {status}
          </p>
        )}
      </div>
    </section>
  );
}

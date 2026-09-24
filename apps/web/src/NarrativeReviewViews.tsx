import type { NarrationQa } from "./schemas/narrative";
import { StudioIcon } from "./StudioIcon";

export type NarrativeOutlineItem = {
  id: string;
  title: string;
  sourceCount: number;
};

export function NarrativeOutline({
  items,
  selectedId,
  onSelect,
}: {
  items: NarrativeOutlineItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return <nav className="narrative-outline" aria-label="Estrutura do roteiro">
    <div className="narrative-column-heading"><div><p className="summary-kicker">OUTLINE</p><h3>Estrutura</h3></div><span>{items.length}</span></div>
    <ol>{items.map((item, index) => <li key={item.id}>
      <button type="button" className={selectedId === item.id ? "selected" : ""} onClick={() => onSelect(item.id)}
        aria-current={selectedId === item.id ? "true" : undefined}>
        <span className="narrative-index">{String(index + 1).padStart(2, "0")}</span>
        <span><strong>{item.title}</strong><small>{item.sourceCount} {item.sourceCount === 1 ? "fonte" : "fontes"}</small></span>
      </button>
    </li>)}</ol>
  </nav>;
}

export function NarrativeSourceCard({ refs, texts }: { refs: string[]; texts: string[] }) {
  return <section className="narrative-source-card" aria-labelledby="narrative-source-title">
    <div className="narrative-column-heading"><div><p className="summary-kicker">PROVENIÊNCIA</p><h3 id="narrative-source-title">Fonte aprovada</h3></div>
      <StudioIcon name="document" size={18} /></div>
    <div className="source-ref-list">{refs.map(ref => <code key={ref}>{ref}</code>)}</div>
    {texts.length > 0 ? texts.map((text, index) => <p key={index}>{text}</p>) : <p className="footnote">Fonte aprovada indisponível para este trecho.</p>}
  </section>;
}

export function NarrativeQaPanel({
  qa,
  busy,
  warningMessages,
  onRun,
}: {
  qa: NarrationQa | null;
  busy: boolean;
  warningMessages: string[];
  onRun: () => void;
}) {
  const statusLabel = !qa ? "Não conferido" : qa.status === "pass" ? "Pronto" : qa.status === "review" ? "Revisão humana" : "Correção necessária";
  return <aside className="narrative-qa-panel" aria-label="QA do roteiro">
    <div className="narrative-column-heading"><div><p className="summary-kicker">QA</p><h3>Conferência</h3></div>
      <span className={"status-badge " + (qa?.status === "fail" ? "danger" : qa?.status === "review" ? "warning" : qa?.status === "pass" ? "success" : "")}>{statusLabel}</span></div>
    <div className="qa-check-list">
      <p><StudioIcon name={qa && qa.duplicatedSpokenHeadings === 0 ? "check" : "warning"} size={16} /><span>Headings duplicados</span><strong>{qa?.duplicatedSpokenHeadings ?? "—"}</strong></p>
      <p><StudioIcon name={qa && qa.unsupportedClaims === 0 ? "check" : "warning"} size={16} /><span>Claims críticos</span><strong>{qa?.unsupportedClaims ?? "—"}</strong></p>
      <p><StudioIcon name={qa?.status === "pass" ? "check" : "review"} size={16} /><span>Fidelidade</span><strong>{qa?.status === "pass" ? "OK" : qa ? "Revisar" : "—"}</strong></p>
    </div>
    {warningMessages.length > 0 && <ul className="qa-warning-list">{warningMessages.map((message, index) => <li key={index}>{message}</li>)}</ul>}
    <button type="button" disabled={busy} onClick={onRun}>{busy ? "Conferindo…" : "Conferir roteiro"}</button>
  </aside>;
}

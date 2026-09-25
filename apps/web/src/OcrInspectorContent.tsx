import { visibleOcrText } from "./adapters/ocr_display_text";
import type { SavedOcrReview } from "./adapters/ocr_review_persistence";

export function OcrNativeTextView({
  pageNumber,
  regionId,
  nativeText,
  pageHasNoText,
}: {
  pageNumber: number;
  regionId: string;
  nativeText: string;
  pageHasNoText: boolean;
}) {
  if (!pageNumber) return <p className="inspector-empty">Selecione uma página para conferir o texto extraído.</p>;
  if (pageHasNoText) return <div className="inspector-state-card">
    <span className="status-badge warning">Sem texto nativo</span>
    <p>Esta página não contém texto extraído. Use a aba OCR para gerar um candidato e revisar o resultado.</p>
  </div>;
  if (!regionId) return <p className="inspector-empty">Selecione uma área da página para ver o texto original extraído.</p>;

  return <section className="inspector-text-card" aria-labelledby="native-text-title">
    <div className="inspector-state-heading">
      <div><p className="inspector-label">ORIGINAL</p><h3 id="native-text-title">Texto extraído do PDF</h3></div>
      <span className="status-badge">Nativo</span>
    </div>
    <pre>{visibleOcrText(nativeText || "Nenhum texto extraído nesta área.")}</pre>
    <p className="footnote">Este conteúdo ainda não incorpora nenhuma correção OCR.</p>
  </section>;
}

export function OcrReconciledTextView({
  proposedText,
  savedReview,
  approvalStatus,
}: {
  proposedText: string;
  savedReview: SavedOcrReview | null;
  approvalStatus: string;
}) {
  if (!savedReview) return <p className="inspector-empty">Ainda não há uma decisão salva para este trecho. Gere e revise um candidato na aba OCR.</p>;
  if (savedReview.submission.disposition !== "propose_correction") {
    return <div className="inspector-state-card">
      <span className="status-badge">Texto nativo mantido</span>
      <p>Esta revisão não criou um texto corrigido. Consulte a aba Nativo ou abra outra revisão no Histórico.</p>
    </div>;
  }

  return <section className="inspector-text-card" aria-labelledby="reconciled-text-title">
    <div className="inspector-state-heading">
      <div><p className="inspector-label">RECONCILIADO</p><h3 id="reconciled-text-title">Texto proposto na revisão</h3></div>
      <span className={"status-badge " + (approvalStatus ? "success" : "warning")}>{approvalStatus ? "Aprovação registrada" : "Aguardando aprovação"}</span>
    </div>
    <pre>{visibleOcrText(proposedText || savedReview.submission.proposedText || "")}</pre>
    <p className="footnote">Justificativa: {savedReview.submission.rationale}</p>
    {approvalStatus && <p role="status">{approvalStatus}</p>}
  </section>;
}

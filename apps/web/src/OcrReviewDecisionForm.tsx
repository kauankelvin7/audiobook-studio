import type { FormEvent } from "react";
import { hasHiddenOcrControls, visibleOcrText } from "./adapters/ocr_display_text";
import type { SavedOcrReview } from "./adapters/ocr_review_persistence";
import type { OcrReviewSubmission } from "./schemas/ocr_candidate";

type Disposition = OcrReviewSubmission["disposition"];

export function OcrReviewDecisionForm({
  pageOnly,
  disposition,
  rationale,
  proposedText,
  learnFromCorrection,
  saving,
  busy,
  opening,
  savedHash,
  savedReview,
  approving,
  approvalStatus,
  canApprove,
  onSubmit,
  onDispositionChange,
  onRationaleChange,
  onProposedTextChange,
  onLearnFromCorrectionChange,
  onApprove,
}: {
  pageOnly: boolean;
  disposition: Disposition;
  rationale: string;
  proposedText: string;
  learnFromCorrection: boolean;
  saving: boolean;
  busy: boolean;
  opening: boolean;
  savedHash: string | null;
  savedReview: SavedOcrReview | null;
  approving: boolean;
  approvalStatus: string;
  canApprove: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDispositionChange: (value: Disposition) => void;
  onRationaleChange: (value: string) => void;
  onProposedTextChange: (value: string) => void;
  onLearnFromCorrectionChange: (value: boolean) => void;
  onApprove: () => void;
}) {
  return <>
    <form onSubmit={onSubmit}>
      <fieldset disabled={saving || busy || opening}>
        <legend>{pageOnly ? "Registrar decisão sobre esta página" : "Registrar decisão sobre esta região"}</legend>
        {([
          ["keep_native", "Manter o texto extraído"],
          ["retain_candidate_for_review", "Guardar o candidato para revisão"],
          ["propose_correction", "Propor texto corrigido"],
        ] as const).filter(([value]) => !pageOnly || value !== "keep_native").map(([value, label]) =>
          <label className="check-label" key={value}>
            <input type="radio" name="ocr-disposition" value={value} checked={disposition === value}
              onChange={() => onDispositionChange(value)} />{label}
          </label>)}

        <label htmlFor="ocr-rationale">Justificativa</label>
        <textarea id="ocr-rationale" value={rationale} required aria-describedby="ocr-review-help"
          onChange={event => onRationaleChange(event.target.value)} />

        {disposition === "propose_correction" && <>
          <label htmlFor="ocr-proposed-text">Texto proposto</label>
          <textarea id="ocr-proposed-text" value={proposedText} required
            onChange={event => onProposedTextChange(event.target.value)} />
          {hasHiddenOcrControls(proposedText) && <p className="notice">O texto proposto contém controles invisíveis:
            <code>{visibleOcrText(proposedText)}</code>
          </p>}
          <label className="check-label"><input type="checkbox" checked={learnFromCorrection}
            onChange={event => onLearnFromCorrectionChange(event.target.checked)} />Usar esta correção para futuras sugestões locais</label>
          <p className="footnote">A correção entra na memória somente após salvar. Ela precisa aparecer em três revisões diferentes antes de virar sugestão.</p>
        </>}
        <p id="ocr-review-help" className="footnote">A decisão fica salva como não verificada. Ela não altera o documento nem a leitura.</p>
        <button type="submit" disabled={!rationale.trim() || (disposition === "propose_correction" && !proposedText.trim())}>
          {saving ? "Salvando revisão…" : "Salvar revisão"}
        </button>
      </fieldset>
    </form>

    {savedHash && <p className="footnote">Revisão histórica salva: {savedHash.slice(0, 20)}…</p>}
    {savedReview?.submission.disposition === "propose_correction" && savedHash === savedReview.receipt.reviewHash && <div className="notice">
      <p>Compare o texto corrigido com a imagem antes de aprovar. A confirmação será registrada neste dispositivo e permitirá a análise narrativa apenas desse conteúdo.</p>
      <button type="button" disabled={!canApprove || approving} onClick={onApprove}>
        {approving ? "Aprovando texto…" : "Aprovar texto corrigido para análise"}
      </button>
      {approvalStatus && <p role="status">{approvalStatus}</p>}
    </div>}
  </>;
}

import { useEffect, useState } from "react";
import type { LocalProjectPersistence } from "./adapters/local_project_persistence";
import { loadLatestCanonicalText, type CanonicalText } from "./adapters/canonical_native";
import { loadLatestApprovedNarrative, saveApprovedNarrative,
  type ApprovedNarrativeRecord } from "./adapters/approved_narrative";
import { buildScriptQa } from "./adapters/rust_script_pipeline";
import type { DocumentIrV2 } from "./schemas/ingestion";
import type { NarrativeScript, NarrationQa } from "./schemas/narrative";
import { userError } from "./adapters/user_error";

export function NarrativePanel({ document, persistence, onApproved }: {
  document: DocumentIrV2;
  persistence: LocalProjectPersistence | null;
  onApproved?: () => void;
}) {
  const [canonical, setCanonical] = useState<CanonicalText | null>(null);
  const [script, setScript] = useState<NarrativeScript | null>(null);
  const [qa, setQa] = useState<NarrationQa | null>(null);
  const [approved, setApproved] = useState<ApprovedNarrativeRecord | null>(null);
  const [rationale, setRationale] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!persistence) return;
    void (async () => {
      try {
        const source = await loadLatestCanonicalText(persistence, document);
        if (cancelled || !source) return;
        setCanonical(source);
        const prior = await loadLatestApprovedNarrative(persistence, document);
        if (cancelled) return;
        setApproved(prior);
        setScript(prior?.approved.script ?? source.draft.script);
        setQa(prior?.approved.qa ?? source.draft.qa);
      } catch (error) {
        if (!cancelled) setStatus(userError(error, "Não foi possível reabrir o roteiro. Recarregue o projeto e tente novamente."));
      }
    })();
    return () => { cancelled = true; };
  }, [document, persistence]);

  function editSegment(sectionIndex: number, text: string) {
    setScript(current => current && ({ ...current, sections: current.sections.map((section, index) =>
      index === sectionIndex ? { ...section, segments: section.segments.map((segment, position) =>
        position === 0 ? { ...segment, displayText: text, speechText: text } : segment) } : section) }));
    setQa(null);
    setApproved(null);
    setConfirmed(false);
  }

  async function runQa() {
    if (!canonical || !script || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const draft = canonical.draft;
      const report = await buildScriptQa(script.planId, script, draft.plan, draft.contentModel, draft.semanticOutline);
      setQa(report);
      setStatus(report.status === "fail" ? "O roteiro precisa de correção antes de gerar áudio. Confira os avisos abaixo."
        : "Conferência concluída. Leia o texto, as fontes e os avisos antes de aprovar.");
    } catch (error) { setStatus(userError(error, "Não foi possível conferir o roteiro. Revise o texto e tente novamente.")); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!canonical || !script || !persistence || !qa || qa.status === "fail" || !confirmed || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const saved = await saveApprovedNarrative(persistence, document, canonical, script, rationale);
      setApproved(saved);
      setQa(saved.approved.qa);
      setStatus("Roteiro aprovado. Trechos de narração salvos neste dispositivo.");
      onApproved?.();
    } catch (error) { setStatus(userError(error, "Não foi possível aprovar o roteiro. Confira os avisos e tente novamente.")); }
    finally { setBusy(false); }
  }

  return <section className="panel" aria-labelledby="narrative-title">
    <h2 id="narrative-title">Roteiro narrativo</h2>
    {!canonical ? <div>
      <p>Aprove o texto na etapa Revisão para preparar o roteiro. Páginas sem texto aprovado precisam de OCR e conferência antes da narração.</p>
      <a href="#review">Ir para revisão do texto</a>
    </div> : <>
      <p>O rascunho usa o texto aprovado. Reescreva cada trecho para a narração e confira a fonte antes de aprovar.</p>
      {script?.sections.map((section, index) => {
        const segment = section.segments[0];
        const source = canonical.draft.contentModel.sourceUnits.find(unit => unit.sourceRefs.some(ref => segment.sourceRefs.includes(ref)));
        return <div className="reading-review" key={section.id}>
          <h3>{canonical.draft.plan.spokenChapters[index]?.displayTitle ?? `Parte ${index + 1}`}</h3>
          <p>Fonte: {segment.sourceRefs.join(", ")}</p>
          <p className="footnote">Texto aprovado: {source?.analysisText ?? "Fonte indisponível"}</p>
          <label htmlFor={`narrative-segment-${index}`}>Texto da narração</label>
          <textarea id={`narrative-segment-${index}`} value={segment.speechText}
            onChange={event => editSegment(index, event.target.value)} disabled={busy} />
        </div>;
      })}
      <button type="button" disabled={busy || !script} onClick={() => void runQa()}>Conferir roteiro</button>
      {qa && <div className="notice" aria-label="Relatório de QA narrativo">
        <p>Estado: {qa.status === "fail" ? "correção necessária" : qa.status === "review" ? "conferência humana necessária" : "pronto"}. Partes: {qa.narrativeSections}. Capítulos: {qa.spokenChapters}.</p>
        <ul>{qa.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}>{warning.code === "CLAIM_GROUNDING_NOT_EVALUATED"
          ? "Confira se cada afirmação do roteiro corresponde ao texto aprovado. Essa verificação depende de você."
          : userError(new Error(warning.message), "Confira este trecho e sua fonte antes de aprovar.")}</li>)}</ul>
      </div>}
      <label htmlFor="narrative-rationale">Justificativa da revisão do roteiro</label>
      <textarea id="narrative-rationale" value={rationale} onChange={event => { setRationale(event.target.value); setConfirmed(false); }} />
      <label className="check-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        Conferi o roteiro com o texto aprovado e confirmo as referências de todas as partes.</label>
      <button type="button" disabled={busy || !qa || qa.status === "fail" || !rationale.trim() || !confirmed}
        onClick={() => void approve()}>Aprovar roteiro para áudio</button>
      {approved && <div>
        <p>Trechos de narração aprovados: {approved.approved.speechUnits.length}.</p>
        <a href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ schemaVersion: 1,
          sourceHash: document.sourceHash, canonicalReviewHash: approved.canonicalReviewHash,
          canonicalDocumentHash: approved.approved.canonicalDocumentHash,
          contentModel: canonical.draft.contentModel, semanticOutline: canonical.draft.semanticOutline,
          plan: approved.approved.plan, script: approved.approved.script,
          sourceMapping: approved.approved.speechUnits.map(unit => ({ speechUnitId: unit.id,
            chapterId: unit.chapterId, sourceRefs: unit.sourceRefs })),
          qa: approved.approved.qa, reviewReceipt: approved.approved.reviewReceipt,
          approval: approved.approved.approval, speechUnits: approved.approved.speechUnits,
        }))}`} download="audiobook-studio-roteiro-narrativo.json">Baixar roteiro, fontes e QA</a>
      </div>}
    </>}
    {status && <p role="status">{status}</p>}
  </section>;
}

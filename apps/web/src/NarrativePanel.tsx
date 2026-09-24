import { useEffect, useState } from "react";
import type { LocalProjectPersistence } from "./adapters/local_project_persistence";
import { loadLatestCanonicalText, type CanonicalText } from "./adapters/canonical_native";
import { loadLatestApprovedNarrative, saveApprovedNarrative,
  type ApprovedNarrativeRecord } from "./adapters/approved_narrative";
import { buildScriptQa } from "./adapters/rust_script_pipeline";
import type { DocumentIrV2 } from "./schemas/ingestion";
import type { NarrativeScript, NarrationQa } from "./schemas/narrative";
import { userError } from "./adapters/user_error";
import { NarrativeOutline, NarrativeQaPanel, NarrativeSourceCard } from "./NarrativeReviewViews";

export function NarrativePanel({ document, persistence, onApproved }: {
  document: DocumentIrV2;
  persistence: LocalProjectPersistence | null;
  onApproved?: () => void;
}) {
  const [canonical, setCanonical] = useState<CanonicalText | null>(null);
  const [script, setScript] = useState<NarrativeScript | null>(null);
  const [qa, setQa] = useState<NarrationQa | null>(null);
  const [approved, setApproved] = useState<ApprovedNarrativeRecord | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState("");
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
        const nextScript = prior?.approved.script ?? source.draft.script;
        setApproved(prior);
        setScript(nextScript);
        setQa(prior?.approved.qa ?? source.draft.qa);
        setSelectedSectionId(current => nextScript.sections.some(section => section.id === current)
          ? current : nextScript.sections[0]?.id ?? "");
      } catch (error) {
        if (!cancelled) setStatus(userError(error, "Não foi possível reabrir o roteiro. Recarregue o projeto e tente novamente."));
      }
    })();
    return () => { cancelled = true; };
  }, [document, persistence]);

  function editSegment(sectionId: string, text: string) {
    setScript(current => current && ({ ...current, sections: current.sections.map(section =>
      section.id === sectionId ? { ...section, segments: section.segments.map((segment, position) =>
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
    } catch (error) {
      setStatus(userError(error, "Não foi possível conferir o roteiro. Revise o texto e tente novamente."));
    } finally { setBusy(false); }
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
    } catch (error) {
      setStatus(userError(error, "Não foi possível aprovar o roteiro. Confira os avisos e tente novamente."));
    } finally { setBusy(false); }
  }

  const outlineItems = script?.sections.map((section, index) => {
    const chapter = canonical?.draft.plan.spokenChapters.find(item => item.sectionIds.includes(section.id));
    const refs = section.segments.flatMap(segment => segment.sourceRefs);
    return { id: section.id, title: chapter?.displayTitle ?? "Parte " + (index + 1), sourceCount: new Set(refs).size };
  }) ?? [];
  const selectedSection = script?.sections.find(section => section.id === selectedSectionId) ?? script?.sections[0] ?? null;
  const selectedSegment = selectedSection?.segments[0] ?? null;
  const selectedChapter = selectedSection && canonical
    ? canonical.draft.plan.spokenChapters.find(item => item.sectionIds.includes(selectedSection.id)) : null;
  const sourceTexts = selectedSegment && canonical ? canonical.draft.contentModel.sourceUnits
    .filter(unit => unit.sourceRefs.some(ref => selectedSegment.sourceRefs.includes(ref)))
    .map(unit => unit.analysisText) : [];
  const warningMessages = qa?.warnings.map(warning => warning.code === "CLAIM_GROUNDING_NOT_EVALUATED"
    ? "Confira se cada afirmação do roteiro corresponde ao texto aprovado. Essa verificação depende de você."
    : userError(new Error(warning.message), "Confira este trecho e sua fonte antes de aprovar.")) ?? [];

  return <section className="panel narrative-panel" aria-labelledby="narrative-title">
    <header className="narrative-panel-header">
      <div><p className="section-kicker">NARRATIVA</p><h2 id="narrative-title">Roteiro narrativo</h2>
        <p>Revise o que será dito, confira a fonte aprovada e valide o QA antes de enviar o roteiro para áudio.</p></div>
      <span className={"status-badge " + (approved ? "success" : qa?.status === "fail" ? "danger" : "warning")}>
        {approved ? "Aprovado" : qa?.status === "fail" ? "Correção necessária" : "Em revisão"}
      </span>
    </header>

    {!canonical ? <div className="narrative-empty">
      <p>Aprove o texto na etapa Revisão para preparar o roteiro. Páginas sem texto aprovado precisam de OCR e conferência antes da narração.</p>
      <a className="button-link" href="#review">Ir para revisão do texto</a>
    </div> : script && selectedSection && selectedSegment ? <>
      <div className="narrative-review-layout">
        <NarrativeOutline items={outlineItems} selectedId={selectedSection.id} onSelect={setSelectedSectionId} />
        <section className="narrative-script-editor" aria-labelledby="narrative-editor-title">
          <div className="narrative-column-heading"><div><p className="summary-kicker">ROTEIRO</p>
            <h3 id="narrative-editor-title">{selectedChapter?.displayTitle ?? "Trecho narrativo"}</h3></div>
            <span>{selectedSegment.sourceRefs.length} {selectedSegment.sourceRefs.length === 1 ? "fonte" : "fontes"}</span></div>
          <label htmlFor={"narrative-segment-" + selectedSection.id}>Texto da narração</label>
          <textarea className="narrative-script-textarea" id={"narrative-segment-" + selectedSection.id}
            value={selectedSegment.speechText} onChange={event => editSegment(selectedSection.id, event.target.value)} disabled={busy} />
          <NarrativeSourceCard refs={selectedSegment.sourceRefs} texts={sourceTexts} />
        </section>
        <NarrativeQaPanel qa={qa} busy={busy} warningMessages={warningMessages} onRun={() => void runQa()} />
      </div>

      <section className="narrative-approval-bar" aria-labelledby="narrative-approval-title">
        <div><p className="summary-kicker">APROVAÇÃO</p><h3 id="narrative-approval-title">Confirmar roteiro para áudio</h3>
          <p>Registre por que o texto está fiel à fonte antes de promover os SpeechUnits.</p></div>
        <div className="narrative-approval-form">
          <label htmlFor="narrative-rationale">Justificativa da revisão</label>
          <textarea id="narrative-rationale" value={rationale}
            onChange={event => { setRationale(event.target.value); setConfirmed(false); }} />
          <label className="check-label"><input type="checkbox" checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)} />
            Conferi o roteiro com o texto aprovado e confirmo as referências de todas as partes.</label>
          <button type="button" disabled={busy || !qa || qa.status === "fail" || !rationale.trim() || !confirmed}
            onClick={() => void approve()}>Aprovar roteiro para áudio</button>
        </div>
      </section>

      {approved && <div className="narrative-approved-result">
        <div><strong>{approved.approved.speechUnits.length}</strong><span>trechos de narração aprovados</span></div>
        <a className="button-link" href={"data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
          schemaVersion: 1,
          sourceHash: document.sourceHash,
          canonicalReviewHash: approved.canonicalReviewHash,
          canonicalDocumentHash: approved.approved.canonicalDocumentHash,
          contentModel: canonical.draft.contentModel,
          semanticOutline: canonical.draft.semanticOutline,
          plan: approved.approved.plan,
          script: approved.approved.script,
          sourceMapping: approved.approved.speechUnits.map(unit => ({ speechUnitId: unit.id, chapterId: unit.chapterId, sourceRefs: unit.sourceRefs })),
          qa: approved.approved.qa,
          reviewReceipt: approved.approved.reviewReceipt,
          approval: approved.approved.approval,
          speechUnits: approved.approved.speechUnits,
        }))} download="audiobook-studio-roteiro-narrativo.json">Baixar roteiro, fontes e QA</a>
      </div>}
    </> : <p className="notice">O texto aprovado ainda não produziu um roteiro utilizável.</p>}
    {status && <p role="status" className="narrative-status">{status}</p>}
  </section>;
}

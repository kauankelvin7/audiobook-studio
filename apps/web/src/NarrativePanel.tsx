import { useEffect, useRef, useState } from "react";
import type { LocalProjectPersistence } from "./adapters/local_project_persistence";
import { loadLatestCanonicalText, type CanonicalText } from "./adapters/canonical_native";
import { loadLatestApprovedNarrative, saveApprovedNarrative,
  type ApprovedNarrativeRecord } from "./adapters/approved_narrative";
import { buildScriptQa } from "./adapters/rust_script_pipeline";
import type { DocumentIrV2 } from "./schemas/ingestion";
import type { NarrativeScript, NarrationQa } from "./schemas/narrative";
import { userError } from "./adapters/user_error";
import { NarrativeOutline, NarrativeQaPanel, NarrativeSourceCard } from "./NarrativeReviewViews";
import { generateLocalNarrative, listLocalNarrativeModels } from "./adapters/local_narrative_model";
import { loadNarrativeDraft, saveNarrativeDraft } from "./adapters/narrative_draft_persistence";

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
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [modelStatus, setModelStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savingGeneration, setSavingGeneration] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0, chapter: 0, chapters: 0 });
  const generation = useRef<AbortController | null>(null);

  useEffect(() => () => generation.current?.abort(), []);

  async function connectModel() {
    setModelStatus("Procurando modelos neste computador…");
    try {
      const available = (await listLocalNarrativeModels()).filter(name => !/embed/i.test(name));
      setModels(available);
      setModel(current => available.includes(current) ? current : available[0] ?? "");
      setModelStatus(available.length ? "Modelo local conectado. O documento permanece neste computador."
        : "Nenhum modelo de texto encontrado. Instale um modelo no Ollama e conecte novamente.");
    } catch (error) {
      setModelStatus(error instanceof Error ? error.message : "Abra o Ollama neste computador e tente conectar novamente.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!persistence) { setLoading(false); return; }
    setLoading(true);
    void (async () => {
      try {
        const source = await loadLatestCanonicalText(persistence, document);
        if (cancelled || !source) return;
        setCanonical(source);
        const prior = await loadLatestApprovedNarrative(persistence, document);
        if (cancelled) return;
        const savedDraft = await loadNarrativeDraft(persistence, document, source);
        if (cancelled) return;
        const nextScript = savedDraft ?? prior?.approved.script ?? source.draft.script;
        const matchesApproval = prior && JSON.stringify(prior.approved.script) === JSON.stringify(nextScript);
        setApproved(matchesApproval ? prior : null);
        setScript(nextScript);
        setQa(matchesApproval ? prior.approved.qa : savedDraft ? null : source.draft.qa);
        setSelectedSectionId(current => nextScript.sections.some(section => section.id === current)
          ? current : nextScript.sections[0]?.id ?? "");
      } catch (error) {
        if (!cancelled) setStatus(userError(error, "Não foi possível reabrir o roteiro. Recarregue o projeto e tente novamente."));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [document, persistence]);

  async function generate(all: boolean) {
    if (!canonical || !script || !model || busy || generating) return;
    const controller = new AbortController();
    generation.current = controller;
    setGenerating(true);
    setConfirmed(false);
    setStatus("");
    const input = { ...canonical.draft.script, sections: canonical.draft.script.sections.filter(section => all || section.id === selectedSectionId) };
    const totalChapters = input.sections.length;
    const totalSegments = input.sections.reduce((sum, section) => sum + section.segments.length, 0);
    setProgress({ completed: 0, total: totalSegments, chapter: 0, chapters: totalChapters });
    // Track which chapter each segment belongs to for richer progress feedback
    let chapterIndex = 0;
    let segmentIndexInChapter = 0;
    let currentSectionIdx = 0;
    try {
      const candidate = await generateLocalNarrative(input, { model, signal: controller.signal, onProgress: (p) => {
        // Determine chapter from segment progression
        if (currentSectionIdx < input.sections.length) {
          const sectionSegCount = input.sections[currentSectionIdx]?.segments.length ?? 1;
          segmentIndexInChapter++;
          if (segmentIndexInChapter >= sectionSegCount) { chapterIndex++; currentSectionIdx++; segmentIndexInChapter = 0; }
        }
        setProgress({ completed: p.completed, total: p.total, chapter: Math.min(chapterIndex + 1, totalChapters), chapters: totalChapters });
      } });
      if (controller.signal.aborted) return;
      const nextScript = { ...script, sections: script.sections.map(section => candidate.sections.find(item => item.id === section.id) ?? section) };
      const report = await buildScriptQa(nextScript.planId, nextScript, canonical.draft.plan, canonical.draft.contentModel, canonical.draft.semanticOutline);
      if (controller.signal.aborted) return;
      setSavingGeneration(true);
      if (persistence) await saveNarrativeDraft(persistence, document, canonical, nextScript);
      if (controller.signal.aborted) return;
      setScript(nextScript);
      setQa(report);
      setApproved(null);
      setStatus(report.status === "fail" ? "O texto foi gerado, mas a conferência encontrou pendências. Corrija os avisos antes de aprovar."
        : "Narrativa gerada. Confira cada trecho com a fonte antes de aprovar para áudio.");
    } catch (error) {
      setStatus(controller.signal.aborted ? "Geração cancelada. O roteiro anterior foi mantido."
        : error instanceof Error ? error.message : "Não foi possível gerar a narrativa. Tente novamente.");
    } finally { if (generation.current === controller) { generation.current = null; setGenerating(false); setSavingGeneration(false); } }
  }

  async function saveDraft() {
    if (!persistence || !canonical || !script || busy || generating) return;
    setBusy(true);
    try {
      await saveNarrativeDraft(persistence, document, canonical, script);
      setStatus("Rascunho salvo neste dispositivo. Você pode continuar depois.");
    } catch (error) { setStatus(userError(error, "Não foi possível salvar o rascunho. Tente novamente.")); }
    finally { setBusy(false); }
  }

  function editSegment(sectionId: string, text: string) {
    setScript(current => current && ({ ...current, sections: current.sections.map(section =>
      section.id === sectionId ? { ...section, segments: section.segments.map((segment, position) =>
        position === 0 ? { ...segment, displayText: text, speechText: text } : segment) } : section) }));
    setQa(null);
    setApproved(null);
    setConfirmed(false);
  }

  async function runQa() {
    if (!canonical || !script || busy || generating) return;
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
    if (!canonical || !script || !persistence || !qa || qa.status === "fail" || !confirmed || busy || generating) return;
    setBusy(true);
    setStatus("");
    try {
      await saveNarrativeDraft(persistence, document, canonical, script);
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
    .map(unit => unit.analysisText)
    .filter((text): text is string => text !== null) : [];
  const warningMessages = qa?.warnings.map(warning => warning.code === "CLAIM_GROUNDING_NOT_EVALUATED"
    ? "Confira se cada afirmação do roteiro corresponde ao texto aprovado. Essa verificação depende de você."
    : userError(new Error(warning.message), "Confira este trecho e sua fonte antes de aprovar.")) ?? [];

  return <section className="panel narrative-panel" aria-labelledby="narrative-title">
    <header className="narrative-panel-header">
      <div><p className="section-kicker">NARRATIVA</p><h2 id="narrative-title">Roteiro narrativo</h2>
        <p>Revise o que será dito, confira a fonte aprovada e os alertas antes de enviar o roteiro para áudio.</p></div>
      <span className={"status-badge " + (approved ? "success" : qa?.status === "fail" ? "danger" : "warning")}>
        {approved ? "Aprovado" : qa?.status === "fail" ? "Correção necessária" : "Em revisão"}
      </span>
    </header>

    {loading ? <p role="status" className="notice">Preparando o roteiro a partir do texto aprovado…</p> : !canonical ? <div className="narrative-empty">
      <p>Aprove o texto na etapa Revisão para preparar o roteiro. Páginas sem texto aprovado precisam de OCR e conferência antes da narração.</p>
      <a className="button-link" href="#review">Ir para revisão do texto</a>
    </div> : script && selectedSection && selectedSegment ? <>
      <section className="narrative-generator" aria-labelledby="narrative-generator-title">
        <div><p className="section-kicker">GERAÇÃO LOCAL</p><h3 id="narrative-generator-title">Transformar texto em narrativa</h3><p>O modelo adapta a escrita para uma leitura natural. Você confere as fontes e aprova o resultado.</p></div>
        <div className="narrative-generator-controls">
          <button type="button" onClick={() => void connectModel()} disabled={generating || busy}>{models.length ? "Atualizar modelos" : "Conectar modelo local"}</button>
          {models.length > 0 && <><label htmlFor="narrative-model">Modelo neste computador</label><select id="narrative-model" value={model} disabled={generating || busy} onChange={event => setModel(event.target.value)}>{models.map(name => <option key={name} value={name}>{name}</option>)}</select><div className="generation-buttons"><button className="primary" type="button" disabled={!model || generating || busy} onClick={() => void generate(false)}>Gerar narrativa deste trecho</button><button type="button" disabled={!model || generating || busy} onClick={() => void generate(true)}>Gerar roteiro completo</button></div></>}
          {modelStatus && <p className="footnote" role="status">{modelStatus}</p>}
          {generating && <div className="narrative-generation-progress" role="status"><progress value={progress.completed} max={progress.total || 1} /><span>{savingGeneration ? "Salvando rascunho…" : progress.chapters > 1 ? `Capítulo ${progress.chapter} de ${progress.chapters}…` : `Adaptando trecho ${Math.min(progress.completed + 1, progress.total)} de ${progress.total}…`}</span><button type="button" disabled={savingGeneration} onClick={() => generation.current?.abort()}>Cancelar geração</button></div>}
        </div>
      </section>
      <div className="narrative-review-layout">
        <NarrativeOutline items={outlineItems} selectedId={selectedSection.id} onSelect={setSelectedSectionId} />
        <section className="narrative-script-editor" aria-labelledby="narrative-editor-title">
          <div className="narrative-column-heading"><div><p className="summary-kicker">ROTEIRO</p>
            <h3 id="narrative-editor-title">{selectedChapter?.displayTitle ?? "Trecho narrativo"}</h3></div>
            <span>{selectedSegment.sourceRefs.length} {selectedSegment.sourceRefs.length === 1 ? "fonte" : "fontes"}</span></div>
          <label htmlFor={"narrative-segment-" + selectedSection.id}>Texto da narração</label>
          <textarea className="narrative-script-textarea" id={"narrative-segment-" + selectedSection.id}
            value={selectedSegment.speechText} onChange={event => editSegment(selectedSection.id, event.target.value)} disabled={busy || generating} />
          <NarrativeSourceCard refs={selectedSegment.sourceRefs} texts={sourceTexts} />
          <button type="button" disabled={busy || generating} onClick={() => void saveDraft()}>Salvar rascunho</button>
        </section>
        <NarrativeQaPanel qa={qa} busy={busy || generating} warningMessages={warningMessages} onRun={() => void runQa()} />
      </div>

      <section className="narrative-approval-bar" aria-labelledby="narrative-approval-title">
        <div><p className="summary-kicker">APROVAÇÃO</p><h3 id="narrative-approval-title">Confirmar roteiro para áudio</h3>
          <p>Registre por que o texto está fiel à fonte antes de liberar os trechos aprovados para a geração de áudio.</p></div>
        <div className="narrative-approval-form">
          <label htmlFor="narrative-rationale">Justificativa da revisão</label>
          <textarea id="narrative-rationale" value={rationale}
            onChange={event => { setRationale(event.target.value); setConfirmed(false); }} />
          <label className="check-label"><input type="checkbox" checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)} />
            Conferi o roteiro com o texto aprovado e confirmo as referências de todas as partes.</label>
          <button type="button" disabled={busy || generating || !qa || qa.status === "fail" || !rationale.trim() || !confirmed}
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
        }))} download="audiobook-studio-roteiro-narrativo.json">Baixar roteiro, fontes e relatório de revisão</a>
      </div>}
    </> : <p className="notice">O texto aprovado ainda não produziu um roteiro utilizável.</p>}
    {status && <p role="status" className="narrative-status">{status}</p>}
  </section>;
}

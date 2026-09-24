import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LocalProjectPersistence } from "./adapters/local_project_persistence";
import { proposeLocalOcrCandidate } from "./adapters/local_ocr_candidate";
import { OcrEvidencePersistence, type SavedOcrEvidence } from "./adapters/ocr_evidence_persistence";
import { OcrReviewPersistence } from "./adapters/ocr_review_persistence";
import { hasHiddenOcrControls, visibleOcrText } from "./adapters/ocr_display_text";
import { compareOcrCandidate } from "./adapters/rust_ocr_candidate";
import type { ArtifactManifestRecord } from "./schemas/persistence";
import type { DocumentIrV2 } from "./schemas/ingestion";
import type { OcrComparisonReport, OcrReviewSubmission } from "./schemas/ocr_candidate";
import { PAGE_OCR_TARGET_ID } from "./schemas/ocr_candidate";

type Disposition = OcrReviewSubmission["disposition"];
type SourceState = "checking" | "ready" | "missing" | "oversize";

export function OcrReviewPanel({ document, persistence, onCommitChange }: {
  document: DocumentIrV2;
  persistence: LocalProjectPersistence | null;
  onCommitChange?: (committing: boolean) => void;
}) {
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [pageNumber, setPageNumber] = useState(0);
  const [regionId, setRegionId] = useState("");
  const [sourceState, setSourceState] = useState<SourceState>("checking");
  const [evidence, setEvidence] = useState<SavedOcrEvidence | null>(null);
  const [comparison, setComparison] = useState<OcrComparisonReport | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [disposition, setDisposition] = useState<Disposition>("retain_candidate_for_review");
  const [rationale, setRationale] = useState("");
  const [proposedText, setProposedText] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ArtifactManifestRecord[]>([]);
  const [savedHash, setSavedHash] = useState<string | null>(null);

  const pageWithoutText = (page: DocumentIrV2["pages"][number] | undefined) =>
    page?.extractionQuality === "no_text" && page.regions.length === 0 && page.rawText.length === 0;
  const eligiblePages = document.pages.filter(page => pageWithoutText(page) || page.regions.some(region =>
    region.bbox !== null && !!region.sources.rawText?.trim()));
  const selectedPage = document.pages[pageNumber - 1];
  const regions = selectedPage?.regions.filter(region =>
    region.bbox !== null && !!region.sources.rawText?.trim()) ?? [];
  const selectedRegion = regionId === PAGE_OCR_TARGET_ID && pageWithoutText(selectedPage)
    ? { id: PAGE_OCR_TARGET_ID } : regions.find(region => region.id === regionId) ?? null;
  const pageOnly = evidence?.candidate.regionId === PAGE_OCR_TARGET_ID
    && pageWithoutText(document.pages[evidence.candidate.pageNumber - 1]);

  useEffect(() => {
    let cancelled = false;
    if (!persistence) { setSourceState("missing"); return; }
    void (async () => {
      const [latest, source, records] = await Promise.all([
        persistence.loadLatest(document.documentId),
        persistence.loadArtifactRecord(document.documentId, "source_pdf"),
        persistence.listArtifactRecords(document.documentId),
      ]);
      if (cancelled) return;
      setSourceState(!latest || !source || source.kind !== "source_pdf"
        || source.contentHash !== document.sourceHash || !latest.artifactKeys.includes("source_pdf")
        ? "missing" : source.sizeBytes > 8_000_000 ? "oversize" : "ready");
      setHistory(records.filter(record => record.kind === "ocr_review_submission")
        .sort((left, right) => right.createdAtMs - left.createdAtMs).slice(0, 100));
    })().catch(() => { if (!cancelled) setSourceState("missing"); });
    return () => { cancelled = true; requestRef.current++; abortRef.current?.abort(); onCommitChange?.(false); };
  }, [document, persistence]);

  useEffect(() => {
    if (!evidence) { setCropUrl(null); return; }
    const url = URL.createObjectURL(evidence.image);
    setCropUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [evidence]);

  function clearSelection() {
    requestRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setEvidence(null);
    setComparison(null);
    setSavedHash(null);
    setDisposition("retain_candidate_for_review");
    setRationale("");
    setProposedText("");
    setError("");
    setStatus("");
  }

  async function generate() {
    if (!persistence || sourceState !== "ready" || !selectedRegion || busy) return;
    const request = ++requestRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    setStatus(regionId === PAGE_OCR_TARGET_ID ? "Gerando OCR da página neste dispositivo…" : "Gerando OCR da região neste dispositivo…");
    setEvidence(null);
    setComparison(null);
    setSavedHash(null);
    try {
      const latest = await persistence.loadLatest(document.documentId);
      const source = await persistence.loadArtifactRecord(document.documentId, "source_pdf");
      if (!latest || latest.sourceHash !== document.sourceHash || !latest.artifactKeys.includes("source_pdf")
        || !source || source.kind !== "source_pdf" || source.contentHash !== document.sourceHash
        || source.sizeBytes > 8_000_000) throw new Error("O PDF salvo não está disponível para este OCR.");
      const blob = await persistence.readArtifact(source);
      if (controller.signal.aborted || request !== requestRef.current) return;
      const { TesseractLocalOcrEngine } = await import("./adapters/tesseract_local_ocr");
      if (controller.signal.aborted || request !== requestRef.current) return;
      const result = await proposeLocalOcrCandidate(new Uint8Array(await blob.arrayBuffer()), document,
        pageNumber, selectedRegion.id, new TesseractLocalOcrEngine(), controller.signal);
      if (controller.signal.aborted || request !== requestRef.current) return;
      setCommitting(true);
      onCommitChange?.(true);
      let saved: SavedOcrEvidence;
      try {
        saved = await new OcrEvidencePersistence(persistence).save(document.documentId, document, result, controller.signal);
      } finally {
        setCommitting(false);
        onCommitChange?.(false);
      }
      if (controller.signal.aborted || request !== requestRef.current) return;
      const report = await compareOcrCandidate(document, saved.candidate);
      if (controller.signal.aborted || request !== requestRef.current) return;
      setEvidence(saved);
      setComparison(report);
      setStatus("Candidato OCR salvo. Compare os textos antes de registrar uma decisão.");
    } catch (cause) {
      if (controller.signal.aborted || request !== requestRef.current) return;
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar OCR.");
      setStatus("");
    } finally {
      if (request === requestRef.current) { setBusy(false); abortRef.current = null; }
    }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!persistence || !evidence || !comparison || saving || (pageOnly && disposition === "keep_native")) return;
    const request = requestRef.current;
    const submission: OcrReviewSubmission = {
      schemaVersion: 1, receiptHash: evidence.receipt.receiptHash, disposition,
      rationale, proposedText: disposition === "propose_correction" ? proposedText : null,
    };
    setSaving(true);
    setError("");
    try {
      const saved = await new OcrReviewPersistence(persistence).save(document.documentId, document,
        evidence.imageArtifact, evidence.recordArtifact, submission);
      if (request !== requestRef.current) return;
      setSavedHash(saved.receipt.reviewHash);
      setStatus("Revisão salva como não verificada. O texto do documento não foi alterado.");
      const records = await persistence.listArtifactRecords(document.documentId);
      if (request === requestRef.current) setHistory(records.filter(record => record.kind === "ocr_review_submission")
        .sort((left, right) => right.createdAtMs - left.createdAtMs).slice(0, 100));
    } catch (cause) {
      if (request === requestRef.current) setError(cause instanceof Error ? cause.message : "Não foi possível salvar a revisão OCR.");
    } finally {
      if (request === requestRef.current) setSaving(false);
    }
  }

  async function openReview(artifact: ArtifactManifestRecord) {
    if (!persistence || opening || busy || saving) return;
    const request = ++requestRef.current;
    setOpening(true);
    setError("");
    try {
      const saved = await new OcrReviewPersistence(persistence).openHistorical(document.documentId, document, artifact);
      if (request !== requestRef.current) return;
      const report = await compareOcrCandidate(document, saved.evidence.candidate);
      if (request !== requestRef.current) return;
      setPageNumber(saved.evidence.candidate.pageNumber);
      setRegionId(saved.evidence.candidate.regionId);
      setEvidence(saved.evidence);
      setComparison(report);
      setDisposition(saved.submission.disposition);
      setRationale(saved.submission.rationale);
      setProposedText(saved.submission.proposedText ?? "");
      setSavedHash(saved.receipt.reviewHash);
      setStatus("Revisão histórica aberta. Atualidade e identidade do revisor não foram verificadas.");
    } catch (cause) {
      if (request === requestRef.current) setError(cause instanceof Error ? cause.message : "Não foi possível abrir a revisão OCR.");
    } finally {
      if (request === requestRef.current) setOpening(false);
    }
  }

  return <section className="panel" aria-labelledby="ocr-title">
    <h2 id="ocr-title">Comparar texto com OCR</h2>
    <p>Escolha uma região com texto extraído ou uma página sem texto. O OCR usa o PDF salvo neste dispositivo; o resultado exige revisão.</p>
    {eligiblePages.length === 0 ? <p className="notice">Este documento não tem região com coordenadas nem página sem texto para OCR.</p>
      : <>
        <label htmlFor="ocr-page">Página</label>
        <select id="ocr-page" value={pageNumber} disabled={busy || saving || opening} onChange={event => {
          clearSelection(); setPageNumber(Number(event.target.value)); setRegionId("");
        }}>
          <option value={0}>Selecione a página</option>
          {eligiblePages.map(page => <option key={page.number} value={page.number}>Página {page.number}</option>)}
        </select>
        <label htmlFor="ocr-region">Área para OCR</label>
        <select id="ocr-region" value={regionId} disabled={busy || saving || opening || (regions.length === 0 && !pageWithoutText(selectedPage))}
          onChange={event => { clearSelection(); setRegionId(event.target.value); }}>
          <option value="">Selecione a área</option>
          {pageWithoutText(selectedPage) && <option value={PAGE_OCR_TARGET_ID}>Página inteira sem texto extraído</option>}
          {regions.map((region, index) => <option key={region.id} value={region.id}>
            {index + 1}. {region.type}: {visibleOcrText((region.sources.rawText ?? "").slice(0, 70)).replace(/\s+/g, " ")}
          </option>)}
        </select>
        {sourceState === "oversize" && <p className="notice">Este PDF excede 8 MB, limite da captura OCR.</p>}
        {sourceState === "missing" && <p className="notice">O PDF salvo não está disponível para OCR.</p>}
        <div className="reading-actions">
          <button type="button" onClick={() => void generate()} disabled={!selectedRegion || sourceState !== "ready" || busy || saving || opening}>
            Gerar candidato OCR
          </button>
          {busy && !committing && <button type="button" onClick={() => { clearSelection(); setStatus("OCR cancelado."); }}>Cancelar OCR</button>}
        </div>
        {committing && <p role="status">Salvando evidência OCR. Aguarde a conclusão.</p>}
      </>}
    {error && <p role="alert" className="notice">{error}</p>}
    {status && <p role="status" aria-live="polite">{status}</p>}
    {evidence && comparison && <div className="ocr-review">
      <h3>{pageOnly ? "Revisão da página" : "Comparação da região"}</h3>
      {(hasHiddenOcrControls(evidence.candidate.text) || hasHiddenOcrControls(document.pages[evidence.candidate.pageNumber - 1]?.regions
        .find(region => region.id === evidence.candidate.regionId)?.sources.rawText ?? ""))
        && <p className="notice">Caracteres invisíveis aparecem como códigos Unicode nesta comparação. Os textos originais foram preservados.</p>}
      {cropUrl && <img className="ocr-crop" src={cropUrl}
        alt={pageOnly ? `Página ${evidence.candidate.pageNumber} inteira usada no OCR` : `Recorte da página ${evidence.candidate.pageNumber} usado no OCR desta região`} />}
      <div className="ocr-columns">
        <section aria-label="Texto extraído do PDF"><h4>Texto extraído</h4>{pageOnly ? <p>Sem texto extraído nesta página.</p> : <pre>{visibleOcrText(document.pages[evidence.candidate.pageNumber - 1]?.regions
          .find(region => region.id === evidence.candidate.regionId)?.sources.rawText ?? "")}</pre>}</section>
        <section aria-label="Texto candidato do OCR"><h4>Texto candidato do OCR</h4><pre>{visibleOcrText(evidence.candidate.text)}</pre></section>
      </div>
      <p>{pageOnly ? "Tokens OCR observados" : "Diferenças de tokens observadas"}: {comparison.differingTokenLowerBound}. Estado: revisão necessária.</p>
      {comparison.truncated && <p className="notice">A comparação foi truncada. A contagem é um limite inferior.</p>}
      {comparison.differences.length > 0 && <div className="ocr-table-wrap"><table>
        <caption>{pageOnly ? "Tokens encontrados pelo OCR nesta página sem texto extraído" : "Tokens diferentes entre texto extraído e OCR"}</caption>
        <thead><tr><th scope="col">Token</th><th scope="col">Extraído</th><th scope="col">OCR</th></tr></thead>
        <tbody>{comparison.differences.map(item => <tr key={item.token}>
          <th scope="row">{item.token}</th><td>{item.nativeCount}</td><td>{item.ocrCount}</td>
        </tr>)}</tbody>
      </table></div>}
      <form onSubmit={event => void saveReview(event)}>
        <fieldset disabled={saving || busy || opening}>
          <legend>{pageOnly ? "Registrar decisão sobre esta página" : "Registrar decisão sobre esta região"}</legend>
          {([
            ["keep_native", "Manter o texto extraído"],
            ["retain_candidate_for_review", "Guardar o candidato para revisão"],
            ["propose_correction", "Propor texto corrigido"],
          ] as const).filter(([value]) => !pageOnly || value !== "keep_native").map(([value, label]) => <label className="check-label" key={value}>
            <input type="radio" name="ocr-disposition" value={value} checked={disposition === value}
              onChange={() => { setDisposition(value); setSavedHash(null); }} />{label}
          </label>)}
          <label htmlFor="ocr-rationale">Justificativa</label>
          <textarea id="ocr-rationale" value={rationale} required aria-describedby="ocr-review-help"
            onChange={event => { setRationale(event.target.value); setSavedHash(null); }} />
          {disposition === "propose_correction" && <>
            <label htmlFor="ocr-proposed-text">Texto proposto</label>
            <textarea id="ocr-proposed-text" value={proposedText} required
              onChange={event => { setProposedText(event.target.value); setSavedHash(null); }} />
            {hasHiddenOcrControls(proposedText) && <p className="notice">O texto proposto contém controles invisíveis:
              <code>{visibleOcrText(proposedText)}</code>
            </p>}
          </>}
          <p id="ocr-review-help" className="footnote">A decisão fica salva como não verificada. Ela não altera o documento nem a leitura.</p>
          <button type="submit" disabled={!rationale.trim() || (disposition === "propose_correction" && !proposedText.trim())}>
            {saving ? "Salvando revisão…" : "Salvar revisão"}
          </button>
        </fieldset>
      </form>
      {savedHash && <p className="footnote">Revisão histórica salva: {savedHash.slice(0, 20)}…</p>}
    </div>}
    {history.length > 0 && <div className="ocr-history">
      <h3>Revisões salvas neste dispositivo</h3>
      <ul>{history.map(item => <li key={item.artifactKey}>
        <span>{new Date(item.createdAtMs).toLocaleString("pt-BR")} · histórico não verificado</span>{" "}
        <button type="button" disabled={busy || opening || saving} onClick={() => void openReview(item)}
          aria-label={`Abrir revisão OCR salva em ${new Date(item.createdAtMs).toLocaleString("pt-BR")}`}>
          Abrir revisão
        </button>
      </li>)}</ul>
    </div>}
  </section>;
}

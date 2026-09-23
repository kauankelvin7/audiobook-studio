import { StrictMode, useEffect, useRef, useState, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserLocalPersistence, type BrowserLocalPersistence } from "./adapters/browser_local_persistence";
import type { CheckpointDraft } from "./adapters/local_project_persistence";
import { MAX_PDF_BYTES } from "./adapters/pdf_limits";
import { LocalSpeechPlayer, type SpeechState } from "./adapters/local_speech";
import { buildReadingSession, type ReadingSession } from "./adapters/rust_reading_preview";
import type { ArtifactWrite } from "./adapters/ports";
import { documentIrSchema, type DocumentIr } from "./schemas/document";
import { documentIrV2Schema, type DocumentIrV2 } from "./schemas/ingestion";
import { decodePipelineResponse } from "./workers/protocol";
import "./styles/tokens.css";

function App() {
  const workerRef = useRef<Worker | null>(null);
  const persistenceRef = useRef<BrowserLocalPersistence | null>(null);
  const speechRef = useRef<LocalSpeechPlayer | null>(null);
  const readingRequestRef = useRef(0);
  const importGenerationRef = useRef(0);
  const [document, setDocument] = useState<DocumentIr | null>(null);
  const [documentV2, setDocumentV2] = useState<DocumentIrV2 | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [preview, setPreview] = useState<ReadingSession | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("Escolha um PDF para conferir o texto extraído.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const synthesis = typeof window === "undefined" ? null : window.speechSynthesis ?? null;
    const player = new LocalSpeechPlayer(synthesis, setSpeechState,
      () => setStatus("A leitura foi interrompida pelo navegador. Tente novamente."));
    speechRef.current = player;
    const refresh = () => {
      const available = player.localVoices();
      setVoices(available);
      setVoiceURI(current => available.some(voice => voice.voiceURI === current) ? current : available[0]?.voiceURI ?? "");
    };
    refresh();
    synthesis?.addEventListener("voiceschanged", refresh);
    return () => {
      synthesis?.removeEventListener("voiceschanged", refresh);
      player.stop();
      speechRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let localPersistence: BrowserLocalPersistence | null = null;

    try {
      localPersistence = createBrowserLocalPersistence();
      persistenceRef.current = localPersistence;
      void (async () => {
        const candidates = [];
        for (const projectId of await localPersistence!.service.listProjectIds()) {
          try {
            const inspection = await localPersistence!.service.inspectResume(projectId);
            if (inspection.checkpoint && inspection.resumable) candidates.push(inspection);
          } catch {
            // Outro contexto pode estar escrevendo; recuperação permanece disponível depois.
          }
        }
        const latest = candidates.sort((left, right) =>
          (right.checkpoint?.createdAtMs ?? 0) - (left.checkpoint?.createdAtMs ?? 0))[0];
        const documentRecord = latest?.artifacts.find(artifact => artifact.artifactKey === "document_ir");
        const documentV2Record = latest?.artifacts.find(artifact => artifact.artifactKey === "document_ir_v2");
        if (!documentRecord || cancelled || importGenerationRef.current !== 0) return;
        const blob = await localPersistence!.service.readArtifact(documentRecord);
        const parsed = documentIrSchema.safeParse(JSON.parse(await blob.text()));
        if (!parsed.success || cancelled || importGenerationRef.current !== 0) return;
        setDocument(parsed.data);
        if (documentV2Record) {
          const v2Blob = await localPersistence!.service.readArtifact(documentV2Record);
          const v2 = documentIrV2Schema.safeParse(JSON.parse(await v2Blob.text()));
          if (v2.success && v2.data.documentId === parsed.data.documentId && v2.data.sourceHash === parsed.data.sourceHash && !cancelled && importGenerationRef.current === 0) {
            setDocumentV2(v2.data);
          }
        }
        if (!cancelled && importGenerationRef.current === 0) setStatus("Seu último projeto foi recuperado neste dispositivo.");
      })().catch(() => undefined);
    } catch {
      persistenceRef.current = null;
    }

    return () => {
      cancelled = true;
      workerRef.current?.terminate();
      workerRef.current = null;
      if (persistenceRef.current === localPersistence) persistenceRef.current = null;
      localPersistence?.close();
    };
  }, []);

  function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    importGenerationRef.current++;
    readingRequestRef.current++;
    speechRef.current?.stop();
    setPreview(null);
    setReviewed(false);
    setDocumentV2(null);
    setPageNumber(1);
    setEndPage(1);
    workerRef.current?.terminate();
    workerRef.current = null;
    setDocument(null);
    setFileName(file.name);
    if (file.size > MAX_PDF_BYTES) {
      setBusy(false);
      setStatus("O PDF ultrapassa o limite de 32 MB. Escolha um arquivo menor.");
      return;
    }

    setBusy(true);
    setStatus("Lendo o PDF neste dispositivo…");
    const worker = new Worker(new URL("./workers/pipeline.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = async (message: MessageEvent<unknown>) => {
      if (workerRef.current !== worker) return;
      const response = decodePipelineResponse(message.data);
      if (!response) return;

      if (response.type === "result") {
        setDocument(response.document);
        setDocumentV2(response.documentV2);
        const pageCount = response.document.pages.length;
        const baseStatus = `${pageCount} ${pageCount === 1 ? "página importada" : "páginas importadas"}. Confira o texto antes de continuar.`;
        worker.terminate();
        workerRef.current = null;

        const persistence = persistenceRef.current?.service;
        if (persistence) {
          const createdAtMs = Date.now();
          const checkpoint: CheckpointDraft = {
            schemaVersion: 1,
            projectId: response.document.documentId,
            createdAtMs,
            pipelineVersion: "m4.2",
            sourceHash: response.document.sourceHash,
            job: { state: "STRUCTURING", resumeState: null },
            artifactKeys: ["source_pdf", "document_ir", "document_ir_v2", ...(response.contentModel ? ["content_model", "semantic_outline"] : [])],
          };
          const writes: ArtifactWrite[] = [
            {
              projectId: checkpoint.projectId,
              artifactKey: "source_pdf",
              kind: "source_pdf",
              value: file,
              mediaType: file.type || "application/pdf",
              createdAtMs,
              regenerable: false,
              pinned: true,
              finalArtifact: false,
              expiresAtMs: null,
            },
            {
              projectId: checkpoint.projectId,
              artifactKey: "document_ir",
              kind: "document_ir",
              value: new Blob([JSON.stringify(response.document)], { type: "application/json" }),
              mediaType: "application/json",
              createdAtMs,
              regenerable: true,
              pinned: false,
              finalArtifact: false,
              expiresAtMs: null,
            },
            {
              projectId: checkpoint.projectId,
              artifactKey: "document_ir_v2",
              kind: "document_ir",
              value: new Blob([JSON.stringify(response.documentV2)], { type: "application/json" }),
              mediaType: "application/json",
              createdAtMs,
              regenerable: true,
              pinned: false,
              finalArtifact: false,
              expiresAtMs: null,
            },
            ...(response.contentModel && response.semanticOutline ? [{
              projectId: checkpoint.projectId,
              artifactKey: "content_model",
              kind: "document_ir",
              value: new Blob([JSON.stringify(response.contentModel)], { type: "application/json" }),
              mediaType: "application/json",
              createdAtMs,
              regenerable: true,
              pinned: false,
              finalArtifact: false,
              expiresAtMs: null,
            }, {
              projectId: checkpoint.projectId,
              artifactKey: "semantic_outline",
              kind: "document_ir",
              value: new Blob([JSON.stringify(response.semanticOutline)], { type: "application/json" }),
              mediaType: "application/json",
              createdAtMs,
              regenerable: true,
              pinned: false,
              finalArtifact: false,
              expiresAtMs: null,
            }] satisfies ArtifactWrite[] : []),
          ];
          try {
            await persistence.persistNext(checkpoint, writes);
            setStatus(`${baseStatus} Progresso salvo neste dispositivo.`);
          } catch {
            setStatus(`${baseStatus} O progresso não pôde ser salvo neste navegador.`);
          }
        } else {
          setStatus(baseStatus);
        }
      } else {
        setStatus(response.message);
        worker.terminate();
        workerRef.current = null;
      }
      setBusy(false);
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      setStatus("Não foi possível ler este PDF. Tente outro arquivo.");
      setBusy(false);
      worker.terminate();
      workerRef.current = null;
    };
    worker.postMessage({ type: "extract", file });
  }

  async function prepareReading() {
    if (!documentV2) return;
    const request = ++readingRequestRef.current;
    speechRef.current?.stop();
    setReviewed(false);
    setPreview(null);
    try {
      const ready = await buildReadingSession(documentV2, pageNumber, endPage);
      if (request !== readingRequestRef.current) return;
      setPreview(ready);
      setStatus("Confira o texto das páginas e confirme antes de ouvir.");
    } catch {
      if (request !== readingRequestRef.current) return;
      setStatus("O intervalo contém página que não pode ser lida com segurança. Escolha páginas com texto selecionável.");
    }
  }

  function startReading() {
    if (!preview || !reviewed || !documentV2 || preview.documentId !== documentV2.documentId
      || preview.startPage !== pageNumber || preview.endPage !== endPage) return;
    try {
      speechRef.current?.play(preview, voiceURI);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível iniciar a leitura.");
    }
  }

  return <main className="shell">
    <header className="intro">
      <p className="eyebrow">Audiobook Studio · leitura de PDF</p>
      <h1>Comece pelo texto do seu PDF</h1>
      <p>Confira o texto extraído e ouça até dez páginas com uma voz local disponível no navegador.</p>
    </header>
    <section className="panel" aria-labelledby="import-title">
      <h2 id="import-title">Importar PDF</h2>
      <p>Selecione um PDF de até 32 MB com texto selecionável. A leitura não cria um arquivo de áudio.</p>
      <label htmlFor="pdf-input">Arquivo PDF</label>
      <input id="pdf-input" type="file" accept=".pdf,application/pdf" onChange={importFile} disabled={busy} />
      {fileName && <p className="file-name">Arquivo: {fileName}</p>}
      <p role="status" aria-live="polite">{status}</p>
    </section>
    {document && <section className="result" aria-labelledby="result-title">
      <div className="result-heading"><h2 id="result-title">Texto encontrado</h2><span>{document.pages.length} páginas</span></div>
      {document.pages.map(page => <article className="page" key={page.number} aria-labelledby={`page-${page.number}`}>
        <h3 id={`page-${page.number}`}>Página {page.number}</h3>
        {page.textQuality === "needs_ocr"
          ? <p className="notice">Não encontramos texto selecionável nesta página. Ela pode precisar de OCR.</p>
          : <div className="blocks">{page.blocks.map(block => <p key={block.id}>{block.text}</p>)}</div>}
      </article>)}
      <p className="footnote">A ordem e o tipo dos trechos ainda precisam de revisão. O PDF é processado neste dispositivo.</p>
    </section>}
    {document && <section className="panel" aria-labelledby="reading-title">
      <h2 id="reading-title">Ouvir o texto do PDF</h2>
      <p>Selecione até dez páginas consecutivas. O texto é lido sem reescrita ou correção automática.</p>
      <label htmlFor="reading-page">Primeira página</label>
      <select id="reading-page" value={pageNumber} onChange={event => {
        readingRequestRef.current++;
        speechRef.current?.stop();
        setPreview(null);
        setReviewed(false);
        setPageNumber(Number(event.target.value));
        setEndPage(Number(event.target.value));
      }}>
        {document.pages.map(page => <option key={page.number} value={page.number}>{page.number}</option>)}
      </select>
      <label htmlFor="reading-end-page">Última página</label>
      <select id="reading-end-page" value={endPage} onChange={event => {
        readingRequestRef.current++;
        speechRef.current?.stop();
        setPreview(null);
        setReviewed(false);
        setEndPage(Number(event.target.value));
      }}>
        {document.pages.filter(page => page.number >= pageNumber && page.number < pageNumber + 10)
          .map(page => <option key={page.number} value={page.number}>{page.number}</option>)}
      </select>
      <button type="button" onClick={() => void prepareReading()} disabled={!documentV2 || busy}>Preparar leitura</button>
      {preview && <div className="reading-review">
        <h3>Texto para conferir</h3>
        <div className="reading-text">{preview.pages.map(page => <section key={page.pageNumber} aria-label={`Página ${page.pageNumber}`}>
          <h4>Página {page.pageNumber}</h4>
          {page.chunks.map(chunk => <p key={chunk.regionId}>{chunk.text}</p>)}
        </section>)}</div>
        <label className="check-label"><input type="checkbox" checked={reviewed} onChange={event => {
          if (!event.target.checked) speechRef.current?.stop();
          setReviewed(event.target.checked);
        }} /> Conferi o texto de todas as páginas selecionadas.</label>
        <label htmlFor="reading-voice">Voz instalada</label>
        <select id="reading-voice" value={voiceURI} onChange={event => setVoiceURI(event.target.value)} disabled={voices.length === 0}>
          {voices.length === 0 ? <option value="">Nenhuma voz local disponível</option>
            : voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
        </select>
        <div className="reading-actions">
          <button type="button" onClick={startReading} disabled={!reviewed || !voiceURI || speechState !== "idle"}>Ouvir</button>
          <button type="button" onClick={() => speechRef.current?.pause()} disabled={speechState !== "playing"}>Pausar</button>
          <button type="button" onClick={() => speechRef.current?.resume()} disabled={speechState !== "paused"}>Retomar</button>
          <button type="button" onClick={() => speechRef.current?.stop()} disabled={speechState === "idle"}>Parar</button>
        </div>
        <p role="status" aria-live="polite">{speechState === "playing" ? "Lendo o texto selecionado." : speechState === "paused" ? "Leitura pausada." : "Leitura parada."}</p>
        <p className="footnote">A voz vem do navegador ou sistema operacional. Esta prévia não exporta áudio nem cria roteiro narrativo.</p>
      </div>}
    </section>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

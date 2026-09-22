import { StrictMode, useEffect, useRef, useState, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserLocalPersistence, type BrowserLocalPersistence } from "./adapters/browser_local_persistence";
import type { CheckpointDraft } from "./adapters/local_project_persistence";
import { MAX_PDF_BYTES } from "./adapters/pdf_limits";
import type { ArtifactWrite } from "./adapters/ports";
import { documentIrSchema, type DocumentIr } from "./schemas/document";
import { decodePipelineResponse } from "./workers/protocol";
import "./styles/tokens.css";

function App() {
  const workerRef = useRef<Worker | null>(null);
  const persistenceRef = useRef<BrowserLocalPersistence | null>(null);
  const [document, setDocument] = useState<DocumentIr | null>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("Escolha um PDF para conferir o texto extraído.");
  const [busy, setBusy] = useState(false);

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
        if (!documentRecord || cancelled) return;
        const blob = await localPersistence!.service.readArtifact(documentRecord);
        const parsed = documentIrSchema.safeParse(JSON.parse(await blob.text()));
        if (!parsed.success || cancelled) return;
        setDocument(parsed.data);
        setStatus("Seu último projeto foi recuperado neste dispositivo.");
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
            pipelineVersion: "m3.2",
            sourceHash: response.document.sourceHash,
            job: { state: "STRUCTURING", resumeState: null },
            artifactKeys: ["source_pdf", "document_ir"],
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

  return <main className="shell">
    <header className="intro">
      <p className="eyebrow">Audiobook Studio · prévia de importação</p>
      <h1>Comece pelo texto do seu PDF</h1>
      <p>Veja o que foi encontrado em cada página antes de preparar o audiolivro. O arquivo é processado neste dispositivo.</p>
    </header>
    <section className="panel" aria-labelledby="import-title">
      <h2 id="import-title">Importar PDF</h2>
      <p>Selecione um arquivo de até 32 MB. Esta etapa ainda não gera áudio.</p>
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
      <p className="footnote">A ordem e o tipo dos trechos ainda precisam de revisão. Nenhum texto foi enviado a um servidor.</p>
    </section>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

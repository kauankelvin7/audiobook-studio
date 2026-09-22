import { StrictMode, useEffect, useRef, useState, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { MAX_PDF_BYTES } from "./adapters/pdf_limits";
import type { DocumentIr } from "./schemas/document";
import { decodePipelineResponse } from "./workers/protocol";
import "./styles/tokens.css";

function App() {
  const workerRef = useRef<Worker | null>(null);
  const [document, setDocument] = useState<DocumentIr | null>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("Escolha um PDF para conferir o texto extraído.");
  const [busy, setBusy] = useState(false);

  useEffect(() => () => workerRef.current?.terminate(), []);

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
    worker.onmessage = (message: MessageEvent<unknown>) => {
      if (workerRef.current !== worker) return;
      const response = decodePipelineResponse(message.data);
      if (!response) return;
      if (response.type === "result") {
        setDocument(response.document);
        const pageCount = response.document.pages.length;
        setStatus(`${pageCount} ${pageCount === 1 ? "página importada" : "páginas importadas"}. Confira o texto antes de continuar.`);
      } else {
        setStatus(response.message);
      }
      setBusy(false);
      worker.terminate();
      workerRef.current = null;
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

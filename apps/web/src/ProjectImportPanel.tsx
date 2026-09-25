import type { ChangeEvent } from "react";
import { StudioIcon } from "./StudioIcon";

export function ProjectImportPanel({
  hasDocument,
  fileName,
  status,
  disabled,
  onChange,
}: {
  hasDocument: boolean;
  fileName: string;
  status: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section className="panel import-panel" id="project" aria-labelledby="import-title">
      <div className="section-heading">
        <span className="section-number">01</span>
        <div>
          <p className="section-kicker">PROJETO</p>
          <h2 id="import-title">{hasDocument ? "Documento do projeto" : "Comece com um PDF"}</h2>
        </div>
      </div>

      <div className={`import-dropzone${hasDocument ? " has-file" : ""}`}>
        <input
          id="pdf-input"
          className="import-file-input"
          type="file"
          accept=".pdf,application/pdf"
          onChange={onChange}
          disabled={disabled}
        />
        <label htmlFor="pdf-input" className="import-dropzone-label">
          <span className="import-icon-wrap">
            <StudioIcon name={hasDocument ? "document" : "upload"} size={32} />
          </span>

          <div className="import-text-block">
            {hasDocument ? (
              <>
                <strong className="import-title">PDF pronto no navegador</strong>
                <p className="file-name-highlight">{fileName}</p>
                <span className="import-hint">Clique para trocar por outro documento PDF</span>
              </>
            ) : (
              <>
                <strong className="import-title">Selecione o arquivo PDF do seu livro</strong>
                <p className="import-lead">O texto será extraído e processado totalmente no seu navegador.</p>
                <span className="import-badge-tag">Até 32 MB · Local-First</span>
              </>
            )}
          </div>
        </label>
      </div>

      {status && (
        <p role="status" aria-live="polite" className="import-status-text">
          {status}
        </p>
      )}
    </section>
  );
}

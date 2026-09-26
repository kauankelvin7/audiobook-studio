import { useState, type ChangeEvent, type DragEvent } from "react";
import { StudioIcon } from "./StudioIcon";

export function ProjectImportPanel({
  hasDocument,
  fileName,
  status,
  disabled,
  onChange,
  onFile,
}: {
  hasDocument: boolean;
  fileName: string;
  status: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState("");
  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = [...event.dataTransfer.files].find(candidate => candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf"));
    if (disabled) return;
    if (!file) {
      setDropError("Escolha um arquivo PDF para continuar.");
      return;
    }
    setDropError("");
    onFile(file);
  }

  return (
    <section className="panel import-panel" id="project" aria-labelledby="import-title">
      <div className="section-heading">
        <span className="section-number">01</span>
        <div>
          <p className="section-kicker">PROJETO</p>
          <h2 id="import-title">{hasDocument ? "Documento do projeto" : "Adicionar um PDF"}</h2>
        </div>
      </div>

      <div
        className={`import-dropzone${hasDocument ? " has-file" : ""}${dragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`}
        aria-disabled={disabled || undefined}
        onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={dropFile}
      >
        <input
          id="pdf-input"
          className="import-file-input"
          type="file"
          accept=".pdf,application/pdf"
          aria-describedby="pdf-input-hint"
          onChange={event => { setDropError(""); onChange(event); }}
          disabled={disabled}
        />
        <label htmlFor="pdf-input" className="import-dropzone-label">
          <span className="import-icon-wrap">
            <StudioIcon name={hasDocument ? "document" : "upload"} size={32} />
          </span>

          <div className="import-text-block">
            {hasDocument ? (
              <>
                <strong className="import-title">Trocar o PDF do projeto</strong>
                <p className="file-name-highlight">{fileName || "Documento atual"}</p>
                <span id="pdf-input-hint" className="import-hint">Escolha outro arquivo para substituir este documento.</span>
              </>
            ) : (
              <>
                <strong className="import-title">Arraste um PDF ou escolha um arquivo</strong>
                <p id="pdf-input-hint" className="import-lead">O documento é aberto e processado neste navegador.</p>
                <span className="import-badge-tag">PDF · até 32 MB · processamento local</span>
              </>
            )}
          </div>
        </label>
      </div>

      {(dropError || status) && (
        <p role="status" aria-live="polite" className="import-status-text">
          {dropError || status}
        </p>
      )}
    </section>
  );
}

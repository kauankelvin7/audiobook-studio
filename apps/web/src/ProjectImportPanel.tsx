import type { ChangeEvent } from "react";

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
  return <section className={`panel import-panel${hasDocument ? " import-panel-loaded" : ""}`} id="project" aria-labelledby="import-title">
    <div className="section-heading"><span className="section-number">01</span><div>
      <p className="section-kicker">PROJETO</p>
      <h2 id="import-title">{hasDocument ? "Documento pronto" : "Comece com um PDF"}</h2>
    </div></div>
    {!hasDocument && <p>Escolha um arquivo de até 32 MB. O texto será processado neste dispositivo.</p>}
    <label htmlFor="pdf-input">Arquivo PDF</label>
    <input id="pdf-input" type="file" accept=".pdf,application/pdf" onChange={onChange} disabled={disabled} />
    {fileName && <p className="file-name">Arquivo: {fileName}</p>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}

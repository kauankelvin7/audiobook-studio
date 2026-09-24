import type { ArtifactManifestRecord } from "./schemas/persistence";

export type OcrInspectorTab = "native" | "ocr" | "reconciled" | "history";

const labels: Record<OcrInspectorTab, string> = {
  native: "Nativo",
  ocr: "OCR",
  reconciled: "Reconciliado",
  history: "Histórico",
};

export function OcrInspectorTabs({ value, onChange }: { value: OcrInspectorTab; onChange: (tab: OcrInspectorTab) => void }) {
  return <div className="inspector-tabs" role="tablist" aria-label="Fonte do trecho">
    {(Object.keys(labels) as OcrInspectorTab[]).map(tab => <button key={tab} type="button" role="tab"
      aria-selected={value === tab} onClick={() => onChange(tab)}>{labels[tab]}</button>)}
  </div>;
}

export function OcrReviewHistoryList({
  history,
  disabled,
  onOpen,
}: {
  history: ArtifactManifestRecord[];
  disabled: boolean;
  onOpen: (item: ArtifactManifestRecord) => void;
}) {
  if (history.length === 0) return null;
  return <div className="ocr-history">
    <h3>Revisões salvas neste dispositivo</h3>
    <ul>{history.map(item => <li key={item.artifactKey}>
      <span>{new Date(item.createdAtMs).toLocaleString("pt-BR")} · histórico não verificado</span>
      <button type="button" disabled={disabled} onClick={() => onOpen(item)}
        aria-label={"Abrir revisão OCR salva em " + new Date(item.createdAtMs).toLocaleString("pt-BR")}>
        Abrir revisão
      </button>
    </li>)}</ul>
  </div>;
}

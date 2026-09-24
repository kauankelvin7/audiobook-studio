import type { KeyboardEvent } from "react";
import type { ArtifactManifestRecord } from "./schemas/persistence";

export type OcrInspectorTab = "native" | "ocr" | "reconciled" | "history";

const labels: Record<OcrInspectorTab, string> = {
  native: "Nativo",
  ocr: "OCR",
  reconciled: "Reconciliado",
  history: "Histórico",
};

const tabs = Object.keys(labels) as OcrInspectorTab[];

export function OcrInspectorTabs({ value, onChange }: { value: OcrInspectorTab; onChange: (tab: OcrInspectorTab) => void }) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next]);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  }

  return <div className="inspector-tabs" role="tablist" aria-label="Fonte do trecho">
    {tabs.map((tab, index) => <button key={tab} id={`ocr-tab-${tab}`} type="button" role="tab"
      aria-selected={value === tab} aria-controls="ocr-inspector-panel" tabIndex={value === tab ? 0 : -1}
      onKeyDown={event => onKeyDown(event, index)} onClick={() => onChange(tab)}>{labels[tab]}</button>)}
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

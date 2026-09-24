import { visibleOcrText } from "./adapters/ocr_display_text";
import type { DocumentIrV2 } from "./schemas/ingestion";
import { PAGE_OCR_TARGET_ID } from "./schemas/ocr_candidate";
import { displayRegionType } from "./presentation_labels";

export type OcrSourceState = "checking" | "ready" | "missing" | "oversize";

export function OcrTargetPicker({
  eligiblePages,
  pageNumber,
  regionId,
  regions,
  pageHasNoText,
  disabled,
  sourceState,
  busy,
  committing,
  selectedRegion,
  onPageChange,
  onRegionChange,
  onGenerate,
  onCancel,
  showGenerate = true,
}: {
  eligiblePages: DocumentIrV2["pages"];
  pageNumber: number;
  regionId: string;
  regions: DocumentIrV2["pages"][number]["regions"];
  pageHasNoText: boolean;
  disabled: boolean;
  sourceState: OcrSourceState;
  busy: boolean;
  committing: boolean;
  selectedRegion: boolean;
  onPageChange: (pageNumber: number) => void;
  onRegionChange: (regionId: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
  showGenerate?: boolean;
}) {
  if (eligiblePages.length === 0) {
    return <p className="notice">Este documento não tem região com coordenadas nem página sem texto para OCR.</p>;
  }

  return <>
    <label htmlFor="ocr-page">Página</label>
    <select id="ocr-page" value={pageNumber} disabled={disabled}
      onChange={event => onPageChange(Number(event.target.value))}>
      <option value={0}>Selecione a página</option>
      {eligiblePages.map(page => <option key={page.number} value={page.number}>Página {page.number}</option>)}
    </select>

    <label htmlFor="ocr-region">Área para OCR</label>
    <select id="ocr-region" value={regionId} disabled={disabled || (regions.length === 0 && !pageHasNoText)}
      onChange={event => onRegionChange(event.target.value)}>
      <option value="">Selecione a área</option>
      {pageHasNoText && <option value={PAGE_OCR_TARGET_ID}>Página inteira sem texto extraído</option>}
      {regions.map((region, index) => <option key={region.id} value={region.id}>
        {index + 1}. {displayRegionType(region.type)}: {visibleOcrText((region.sources.rawText ?? "").slice(0, 70)).replace(/\s+/g, " ")}
      </option>)}
    </select>

    {showGenerate && <>
      {sourceState === "oversize" && <p className="notice">Este PDF excede 8 MB, limite da captura OCR.</p>}
      {sourceState === "missing" && <p className="notice">O PDF salvo não está disponível para OCR.</p>}
      <div className="reading-actions">
        <button type="button" onClick={onGenerate} disabled={!selectedRegion || sourceState !== "ready" || busy || disabled}>Gerar candidato OCR</button>
        {busy && !committing && <button type="button" onClick={onCancel}>Cancelar OCR</button>}
      </div>
      {committing && <p role="status">Salvando evidência OCR. Aguarde a conclusão.</p>}
    </>}
  </>;
}

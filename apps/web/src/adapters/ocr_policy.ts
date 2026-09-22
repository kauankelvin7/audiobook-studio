import type { ExtractionQuality } from "../schemas/ingestion";

export type OcrPlan =
  | { action: "use_native"; scope: "page"; regionIds: [] }
  | { action: "ocr_regions"; scope: "regions"; regionIds: string[] }
  | { action: "ocr_page"; scope: "page"; regionIds: [] }
  | { action: "ocr_and_reconcile"; scope: "page" | "regions"; regionIds: string[] };

export function planSelectiveOcr(quality: ExtractionQuality, affectedRegionIds: string[]): OcrPlan {
  const regionIds = [...new Set(affectedRegionIds.map(id => id.trim()).filter(Boolean))];
  if (quality === "good") return { action: "use_native", scope: "page", regionIds: [] };
  if (quality === "no_text") return { action: "ocr_page", scope: "page", regionIds: [] };
  if (quality === "partial") {
    if (!regionIds.length) throw new Error("PARTIAL_REQUIRES_REGIONS");
    return { action: "ocr_regions", scope: "regions", regionIds };
  }
  return { action: "ocr_and_reconcile", scope: regionIds.length ? "regions" : "page", regionIds };
}

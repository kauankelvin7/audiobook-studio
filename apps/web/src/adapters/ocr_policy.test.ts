import { describe, expect, it } from "vitest";
import { planSelectiveOcr } from "./ocr_policy";

describe("selective OCR planning", () => {
  it("uses native text when quality is good", () => expect(planSelectiveOcr("good", ["r1"])).toEqual({ action: "use_native", scope: "page", regionIds: [] }));
  it("normalizes and limits partial OCR to unique affected regions", () => expect(planSelectiveOcr("partial", [" r2 ", "r2", "r3"])).toEqual({ action: "ocr_regions", scope: "regions", regionIds: ["r2", "r3"] }));
  it("uses page OCR only when native text is absent", () => expect(planSelectiveOcr("no_text", ["r1"])).toEqual({ action: "ocr_page", scope: "page", regionIds: [] }));
  it("reconciles identified corrupted regions", () => expect(planSelectiveOcr("corrupted", ["r1"])).toEqual({ action: "ocr_and_reconcile", scope: "regions", regionIds: ["r1"] }));
  it("reconciles the full page when no corrupted region is identified", () => expect(planSelectiveOcr("corrupted", [])).toEqual({ action: "ocr_and_reconcile", scope: "page", regionIds: [] }));
  it("rejects partial quality without identified regions", () => expect(() => planSelectiveOcr("partial", [])).toThrow("PARTIAL_REQUIRES_REGIONS"));
});

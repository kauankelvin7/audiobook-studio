import { describe, expect, it } from "vitest";
import { hasHiddenOcrControls, visibleOcrText } from "./ocr_display_text";

describe("OCR display of untrusted text", () => {
  it("reveals bidi and zero-width controls while preserving useful line breaks", () => {
    const source = "ABC\u202E01\u2066\u200D\u2069\nNEXT\tX\u0001";
    expect(visibleOcrText(source)).toBe("ABC⟦U+202E⟧01⟦U+2066⟧⟦U+200D⟧⟦U+2069⟧\nNEXT\tX⟦U+0001⟧");
    expect(hasHiddenOcrControls(source)).toBe(true);
    expect(hasHiddenOcrControls("COBOL\nPROGRAM-ID\tA")).toBe(false);
    expect(source).toContain("\u202E");
  });
});

import { readFile, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { extractPdf } from "./pdf";
import { analyzeDocumentV1 } from "./rust_content_pipeline";

// Opt-in: local PDFs stay outside the repository and CI. Tests assert metadata only.
const cicsPath = process.env.AUDIOBOOK_CORPUS_CICS_PDF;
const apostilaPath = process.env.AUDIOBOOK_CORPUS_APOSTILA_PDF;
if (cicsPath || apostilaPath) {
  const wasmPath = fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url));
  initSync({ module: readFileSync(wasmPath) });
}

describe("local COBOL corpus (opt-in)", () => {
  it.skipIf(!cicsPath)("quarantines suspect CICS text through PDF.js and real Rust/WASM", async () => {
    const bytes = new Uint8Array(readFileSync(cicsPath!));
    const document = await extractPdf(bytes);
    expect(document.sourceHash).toBe("sha256:58b839407977f054bcc36c6ea42d4f423eb73b40c6937c83655420bf654926c8");
    expect(document.pages).toHaveLength(105);
    const analysis = await analyzeDocumentV1(document);
    expect(analysis.documentV2.pages).toHaveLength(105);
    expect(analysis.documentV2.pages.every(page => page.extractionQuality === "corrupted")).toBe(true);
    expect(analysis.contentModel?.sourceUnits.some(unit => unit.narrationEligibility === "blocked")).toBe(true);
    expect(analysis.contentModel?.sourceUnits.some(unit => unit.flags.includes("private_use_glyphs_in_native_text"))).toBe(true);
    expect(analysis.contentModel?.sourceUnits.filter(unit => unit.flags.includes("private_use_glyphs_in_native_text"))
      .every(unit => unit.narrationEligibility === "blocked")).toBe(true);
  }, 180_000);

  it.skipIf(!apostilaPath)("keeps the control PDF free of private-use text flags", async () => {
    const bytes = new Uint8Array(readFileSync(apostilaPath!));
    const document = await extractPdf(bytes);
    expect(document.sourceHash).toBe("sha256:34ed666f7e1c8e5291c7a01e4b46db4f869e16620b10568667980f21f2514332");
    expect(document.pages).toHaveLength(75);
    const analysis = await analyzeDocumentV1(document);
    expect(analysis.documentV2.pages).toHaveLength(75);
    expect(analysis.documentV2.pages.every(page => page.extractionQuality === "good")).toBe(true);
    expect(analysis.contentModel?.sourceUnits.length).toBeGreaterThan(0);
    expect(analysis.contentModel?.sourceUnits.some(unit => unit.flags.includes("private_use_glyphs_in_native_text"))).toBe(false);
  }, 180_000);
});

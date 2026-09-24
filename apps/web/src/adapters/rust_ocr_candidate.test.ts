import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { initSync } from "../generated/audiobook_wasm/audiobook_wasm.js";
import documentV2Fixture from "../../../../tests/fixtures/document_ir_v2.json";
import { documentIrV2Schema } from "../schemas/ingestion";
import { ocrCandidateSchema, PAGE_OCR_TARGET_ID } from "../schemas/ocr_candidate";
import { buildOcrCandidateReceipt, buildOcrReviewReceipt, compareOcrCandidate } from "./rust_ocr_candidate";

const wasmPath = fileURLToPath(new URL("../generated/audiobook_wasm/audiobook_wasm_bg.wasm", import.meta.url));
initSync({ module: readFileSync(wasmPath) });

function hash(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

describe("real Rust/WASM OCR candidate contract", () => {
  const document = documentIrV2Schema.parse(documentV2Fixture);
  const region = document.pages[0].regions[0];
  const candidate = ocrCandidateSchema.parse({
    schemaVersion: 1,
    documentId: document.documentId,
    sourceHash: document.sourceHash,
    pageNumber: 1,
    regionId: region.id,
    nativeTextHash: hash(region.sources.rawText!),
    imageHash: hash("rendered region bytes"),
    engineId: "fixture-engine",
    engineVersion: "1",
    text: "  RECOVERED  CODE\n",
  });

  it("returns a pending, source-bound receipt without rewriting the OCR text", async () => {
    expect(candidate.text).toBe("  RECOVERED  CODE\n");
    const receipt = await buildOcrCandidateReceipt(document, candidate);
    expect(receipt).toMatchObject({
      documentId: document.documentId,
      sourceHash: document.sourceHash,
      pageNumber: 1,
      regionId: region.id,
      nativeTextHash: candidate.nativeTextHash,
      ocrTextHash: hash(candidate.text),
      status: "pending",
      methodVersion: "ocr-candidate-rust-v1",
    });
    expect(await buildOcrCandidateReceipt(document, candidate)).toEqual(receipt);
    expect((await buildOcrCandidateReceipt(document, { ...candidate, text: `${candidate.text}!` })).receiptHash).not.toBe(receipt.receiptHash);
  });

  it("rejects stale or mismatched candidates through Rust/WASM", async () => {
    await expect(buildOcrCandidateReceipt(document, { ...candidate, nativeTextHash: hash("old text") }))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    await expect(buildOcrCandidateReceipt(document, { ...candidate, pageNumber: 2 }))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    await expect(buildOcrCandidateReceipt(document, { ...candidate, text: " " }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("reports exact technical-token differences without approving OCR", async () => {
    const observed = { ...candidate, text: "PROCEDURE DIVISION" };
    const report = await compareOcrCandidate(document, observed);
    expect(report.status).toBe("review_required");
    expect(report.differingTokenLowerBound).toBe(4);
    expect(report.differences).toContainEqual({ token: "PR0CEDURE", nativeCount: 1, ocrCount: 0, containsDigit: true });
    expect(report.differences).toContainEqual({ token: "PROCEDURE", nativeCount: 0, ocrCount: 1, containsDigit: false });
    expect(report.receiptHash).toBe((await buildOcrCandidateReceipt(document, observed)).receiptHash);
    expect((await compareOcrCandidate(document, { ...candidate, text: region.sources.rawText! })).status).toBe("review_required");
  });

  it("labels an omitted token difference as an incomplete lower bound through real WASM", async () => {
    const native = Array.from({ length: 4_096 }, (_, index) => `T${String(index).padStart(4, "0")}`).join(" ");
    const changedDocument = {
      ...document,
      pages: [{ ...document.pages[0], rawText: native, regions: [{ ...region,
        sources: { ...region.sources, rawText: native } }] }],
    };
    const observed = { ...candidate, nativeTextHash: hash(native), text: `${native} EXTRA` };
    const report = await compareOcrCandidate(changedDocument, observed);
    expect(report).toMatchObject({ status: "review_required", differingTokenLowerBound: 0, truncated: true, differences: [] });
  });

  it("accepts a schema-valid control-heavy OCR candidate at the text limit", async () => {
    const observed = { ...candidate, text: "\u0001".repeat(999_999) + "A" };
    const report = await compareOcrCandidate(document, observed);
    expect(report.status).toBe("review_required");
    expect(report.ocrTextHash).toBe(hash(observed.text));
  });

  it("binds an explicit OCR review without changing document or approving it", async () => {
    const receipt = await buildOcrCandidateReceipt(document, candidate);
    const submission = { schemaVersion: 1 as const, receiptHash: receipt.receiptHash,
      disposition: "propose_correction" as const, rationale: "Conferido contra a imagem.", proposedText: "RECOVERED CODE" };
    const before = JSON.stringify(document);
    const reviewed = await buildOcrReviewReceipt(document, candidate, submission);
    expect(reviewed).toMatchObject({ status: "unverified", candidateReceiptHash: receipt.receiptHash,
      disposition: "propose_correction", proposedText: "RECOVERED CODE" });
    expect(await buildOcrReviewReceipt(document, candidate, submission)).toEqual(reviewed);
    expect(JSON.stringify(document)).toBe(before);
    await expect(buildOcrReviewReceipt(document, candidate, { ...submission, receiptHash: hash("forged") }))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    await expect(buildOcrReviewReceipt(document, candidate, { ...submission, rationale: " " }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("accepts a no-text page target but never treats its OCR as native or verified", async () => {
    const blankDocument = { ...document, pages: [...document.pages, {
      ...document.pages[0], number: 2, extractionQuality: "no_text" as const,
      rawText: "", regions: [],
    }] };
    const observed = { ...candidate, pageNumber: 2, regionId: PAGE_OCR_TARGET_ID,
      nativeTextHash: hash(""), text: "COBOL PROCEDURE DIVISION" };
    const receipt = await buildOcrCandidateReceipt(blankDocument, observed);
    expect(receipt).toMatchObject({ status: "pending", pageNumber: 2, regionId: PAGE_OCR_TARGET_ID });
    const comparison = await compareOcrCandidate(blankDocument, observed);
    expect(comparison).toMatchObject({ status: "review_required", nativeTextHash: hash("") });
    await expect(buildOcrReviewReceipt(blankDocument, observed, { schemaVersion: 1,
      receiptHash: receipt.receiptHash, disposition: "keep_native", rationale: "Sem texto", proposedText: null }))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
    await expect(buildOcrCandidateReceipt(document, { ...observed, pageNumber: 1 }))
      .rejects.toMatchObject({ code: "CORE_REJECTED" });
  });

  it("does not shadow a real region whose ID matches the virtual page target", async () => {
    const realDocument = { ...document, pages: [{ ...document.pages[0], regions: [{ ...region, id: PAGE_OCR_TARGET_ID }] }] };
    const observed = { ...candidate, regionId: PAGE_OCR_TARGET_ID };
    const receipt = await buildOcrCandidateReceipt(realDocument, observed);
    expect(receipt.status).toBe("pending");
    await expect(buildOcrReviewReceipt(realDocument, observed, { schemaVersion: 1,
      receiptHash: receipt.receiptHash, disposition: "keep_native", rationale: "Região real", proposedText: null }))
      .resolves.toMatchObject({ status: "unverified" });
  });
});

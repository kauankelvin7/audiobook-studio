import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((done, reject) => probe.close(error => error ? reject(error) : done()));
const baseUrl = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: process.cwd(), stdio: "ignore" });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(baseUrl)).ok) { ready = true; break; } } catch { /* Wait for Vite. */ }
    await delay(200);
  }
  assert.ok(ready, "Vite did not start");
  browser = await chromium.launch({ ...(process.env.AUDIO_BROWSER_CHANNEL ? { channel: process.env.AUDIO_BROWSER_CHANNEL } : {}), headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", error => console.error(`PAGE ERROR ${error.message}`));
  page.on("crash", () => console.error("PAGE CRASH"));
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) console.error(`NAVIGATED ${frame.url()}`); });
  const foreignRequests = [];
  context.on("request", request => {
    if (!request.url().startsWith(baseUrl) && !request.url().startsWith("blob:")) foreignRequests.push(request.url());
  });
  await page.goto(baseUrl);
  await page.waitForLoadState("networkidle");
  const bytes = [...new Uint8Array(await readFile(resolve("../../tests/fixtures/text_and_blank.pdf")))];
  const result = await page.evaluate(async input => {
    const { extractPdf } = await import("/src/adapters/pdf.ts");
    const { analyzeDocumentV1 } = await import("/src/adapters/rust_content_pipeline.ts");
    const { proposeLocalOcrCandidate } = await import("/src/adapters/local_ocr_candidate.ts");
    const { TesseractLocalOcrEngine } = await import("/src/adapters/tesseract_local_ocr.ts");
    const { IndexedDbCheckpointRepository } = await import("/src/adapters/indexeddb_checkpoint_repository.ts");
    const { OpfsArtifactStore } = await import("/src/adapters/opfs_artifact_store.ts");
    const { WebLocksProjectLock } = await import("/src/adapters/web_locks_project_lock.ts");
    const { LocalProjectPersistence } = await import("/src/adapters/local_project_persistence.ts");
    const { OcrEvidencePersistence } = await import("/src/adapters/ocr_evidence_persistence.ts");
    const { compareOcrCandidate } = await import("/src/adapters/rust_ocr_candidate.ts");
    const bytes = new Uint8Array(input);
    const v1 = await extractPdf(bytes);
    const { documentV2 } = await analyzeDocumentV1(v1);
    const region = documentV2.pages[0].regions.find(item => item.bbox && item.sources.rawText?.includes("Capitulo"));
    if (!region) throw new Error("Expected text region missing");
    const result = await proposeLocalOcrCandidate(bytes, documentV2, 1, region.id, new TesseractLocalOcrEngine());
    const databaseName = `ocr-smoke-${Date.now()}`;
    const state = new IndexedDbCheckpointRepository({ databaseName });
    const persistence = new LocalProjectPersistence(state, new OpfsArtifactStore(), new WebLocksProjectLock());
    await persistence.persist({ schemaVersion: 1, projectId: "ocr_smoke", sequence: 1,
      createdAtMs: Date.now(), pipelineVersion: "smoke", sourceHash: documentV2.sourceHash,
      job: { state: "VERIFYING", resumeState: null }, artifactKeys: [] }, []);
    const evidence = new OcrEvidencePersistence(persistence);
    const saved = await evidence.save("ocr_smoke", documentV2, result);
    const restored = await evidence.readHistorical("ocr_smoke", documentV2, saved.imageArtifact, saved.recordArtifact);
    const comparison = await compareOcrCandidate(documentV2, restored.candidate);
    const sequence = (await persistence.loadLatest("ocr_smoke")).sequence;
    await evidence.save("ocr_smoke", documentV2, result);
    const retrySequence = (await persistence.loadLatest("ocr_smoke")).sequence;
    state.close();
    return { text: result.candidate.text, status: result.receipt.status, imageHash: result.crop.imageHash,
      receiptImageHash: result.receipt.imageHash, engineId: result.receipt.engineId,
      restoredImageHash: restored.receipt.imageHash, currentness: restored.currentness,
      comparisonStatus: comparison.status, comparisonReceiptHash: comparison.receiptHash,
      receiptHash: restored.receipt.receiptHash, sequence, retrySequence, databaseName,
      imageArtifact: saved.imageArtifact, recordArtifact: saved.recordArtifact };
  }, bytes);
  assert.match(result.text, /Capitulo/i);
  assert.equal(result.status, "pending");
  assert.equal(result.imageHash, result.receiptImageHash);
  assert.equal(result.imageHash, result.restoredImageHash);
  assert.equal(result.engineId, "tesseract-js-local-por");
  assert.equal(result.currentness, "not_established");
  assert.equal(result.comparisonStatus, "review_required");
  assert.equal(result.comparisonReceiptHash, result.receiptHash);
  assert.equal(result.retrySequence, result.sequence);
  await page.reload();
  await page.waitForLoadState("networkidle");
  const afterReload = await page.evaluate(async ({ input, imageArtifact, recordArtifact, databaseName }) => {
    await import("/src/adapters/pdf_ocr_crop.ts");
    const { extractPdf } = await import("/src/adapters/pdf.ts");
    const { analyzeDocumentV1 } = await import("/src/adapters/rust_content_pipeline.ts");
    const { IndexedDbCheckpointRepository } = await import("/src/adapters/indexeddb_checkpoint_repository.ts");
    const { OpfsArtifactStore } = await import("/src/adapters/opfs_artifact_store.ts");
    const { WebLocksProjectLock } = await import("/src/adapters/web_locks_project_lock.ts");
    const { LocalProjectPersistence } = await import("/src/adapters/local_project_persistence.ts");
    const { OcrEvidencePersistence } = await import("/src/adapters/ocr_evidence_persistence.ts");
    const v1 = await extractPdf(new Uint8Array(input));
    const { documentV2 } = await analyzeDocumentV1(v1);
    const state = new IndexedDbCheckpointRepository({ databaseName });
    const persistence = new LocalProjectPersistence(state, new OpfsArtifactStore(), new WebLocksProjectLock());
    const restored = await new OcrEvidencePersistence(persistence).readHistorical("ocr_smoke", documentV2, imageArtifact, recordArtifact);
    state.close();
    return { imageHash: restored.receipt.imageHash, currentness: restored.currentness };
  }, { input: bytes, imageArtifact: result.imageArtifact, recordArtifact: result.recordArtifact, databaseName: result.databaseName });
  assert.equal(afterReload.imageHash, result.imageHash);
  assert.equal(afterReload.currentness, "not_established");
  const codeText = await page.evaluate(async () => {
    const { TesseractLocalOcrEngine } = await import("/src/adapters/tesseract_local_ocr.ts");
    const lines = [
      "IDENTIFICATION DIVISION.",
      "PROGRAM-ID. SAMPLE01.",
      "PROCEDURE DIVISION.",
      "DISPLAY \"HELLO, COBOL\".",
      "STOP RUN.",
    ];
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 300;
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black";
    context.font = "30px monospace";
    lines.forEach((line, index) => context.fillText(line, 24, 52 + index * 48));
    const image = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    return await new TesseractLocalOcrEngine().recognize(image, new AbortController().signal);
  });
  const codeTokens = ["IDENTIFICATION", "DIVISION", "PROGRAM-ID", "SAMPLE01", "PROCEDURE", "DISPLAY", "COBOL", "STOP RUN"];
  const missingCodeTokens = codeTokens.filter(token => !codeText.toUpperCase().includes(token));
  for (const token of codeTokens.filter(token => token !== "SAMPLE01")) {
    assert.ok(!missingCodeTokens.includes(token), `OCR missed technical token ${token}: ${JSON.stringify(codeText)}`);
  }
  assert.deepEqual(foreignRequests, []);
  console.log(`PASS local OCR receipt=${result.status} textLength=${result.text.length} codeTokens=${codeTokens.length - missingCodeTokens.length}/${codeTokens.length} missing=${missingCodeTokens.join(",") || "none"} foreignRequests=0`);
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([once(server, "exit"), delay(5_000)]);
}

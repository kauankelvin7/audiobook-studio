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
    try { if ((await fetch(baseUrl)).ok) { ready = true; break; } } catch { /* Vite is starting. */ }
    await delay(200);
  }
  assert.ok(ready, "Vite did not start");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const foreignRequests = [];
  context.on("request", request => {
    if (!request.url().startsWith(baseUrl) && !request.url().startsWith("blob:")) foreignRequests.push(request.url());
  });
  await page.goto(baseUrl);
  const fixture = JSON.parse(await readFile(resolve("../../tests/fixtures/document_ir_v2.json"), "utf8"));
  const report = await page.evaluate(async document => {
    const { documentIrV2Schema } = await import("/src/schemas/ingestion.ts");
    const { buildOcrCandidateReceipt } = await import("/src/adapters/rust_ocr_candidate.ts");
    const { buildOcrCorrectionTrainingRecord, suggestOcrCorrections } = await import("/src/adapters/rust_ocr_learning.ts");
    const { OcrLearningRepository } = await import("/src/adapters/ocr_learning_repository.ts");
    const parsed = documentIrV2Schema.parse(document);
    const native = parsed.pages[0].regions[0].sources.rawText;
    const hash = async value => `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("")}`;
    const candidate = {
      schemaVersion: 1, documentId: parsed.documentId, sourceHash: parsed.sourceHash, pageNumber: 1,
      regionId: parsed.pages[0].regions[0].id, nativeTextHash: await hash(native), imageHash: await hash("smoke pixels"),
      engineId: "smoke-engine", engineVersion: "1", text: "M0VE T0 SAMPLE01",
    };
    const repository = new OcrLearningRepository(undefined, `ocr-learning-smoke-${Date.now()}`);
    for (const [index, rationale] of ["Revisão um.", "Revisão dois.", "Revisão três."].entries()) {
      const reviewed = { ...candidate, imageHash: await hash(`smoke pixels ${index}`) };
      const receipt = await buildOcrCandidateReceipt(parsed, reviewed);
      const record = await buildOcrCorrectionTrainingRecord(parsed, reviewed, {
        schemaVersion: 1, receiptHash: receipt.receiptHash, disposition: "propose_correction", rationale,
        proposedText: "MOVE TO SAMPLE01",
      });
      await repository.save(record);
    }
    const records = await repository.list();
    const suggestion = await suggestOcrCorrections(parsed, candidate, records);
    return { stored: records.length, status: suggestion.status, text: suggestion.suggestedText,
      suggestions: suggestion.suggestions.map(item => `${item.observedToken}:${item.suggestedToken}:${item.evidenceCount}`) };
  }, fixture);
  assert.deepEqual(report, { stored: 3, status: "review_required", text: "MOVE TO SAMPLE01",
    suggestions: ["M0VE:MOVE:3", "T0:TO:3"] });
  assert.deepEqual(foreignRequests, []);
  console.log("PASS OCR learning Rust/WASM/IndexedDB review-required foreignRequests=0");
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([once(server, "exit"), delay(5_000)]);
}

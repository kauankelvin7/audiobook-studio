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
  const page = await browser.newPage();
  page.on("pageerror", error => console.error(`PAGE ERROR ${error.message}`));
  page.on("crash", () => console.error("PAGE CRASH"));
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) console.error(`NAVIGATED ${frame.url()}`); });
  const foreignRequests = [];
  page.on("request", request => {
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
    const bytes = new Uint8Array(input);
    const v1 = await extractPdf(bytes);
    const { documentV2 } = await analyzeDocumentV1(v1);
    const region = documentV2.pages[0].regions.find(item => item.bbox && item.sources.rawText?.includes("Capitulo"));
    if (!region) throw new Error("Expected text region missing");
    const result = await proposeLocalOcrCandidate(bytes, documentV2, 1, region.id, new TesseractLocalOcrEngine());
    return { text: result.candidate.text, status: result.receipt.status, imageHash: result.crop.imageHash,
      receiptImageHash: result.receipt.imageHash, engineId: result.receipt.engineId };
  }, bytes);
  assert.match(result.text, /Capitulo/i);
  assert.equal(result.status, "pending");
  assert.equal(result.imageHash, result.receiptImageHash);
  assert.equal(result.engineId, "tesseract-js-local-por");
  assert.deepEqual(foreignRequests, []);
  console.log(`PASS local OCR receipt=${result.status} textLength=${result.text.length} foreignRequests=0`);
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([once(server, "exit"), delay(5_000)]);
}

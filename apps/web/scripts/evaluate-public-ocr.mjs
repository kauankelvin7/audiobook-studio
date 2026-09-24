import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Usage: node scripts/evaluate-public-ocr.mjs <local-public-pdf>");
const pdfBytes = await readFile(resolve(sourcePath));
assert.ok(pdfBytes.length > 5 && pdfBytes.length <= 8_000_000 && pdfBytes.subarray(0, 5).toString() === "%PDF-");
const sourceHash = createHash("sha256").update(pdfBytes).digest("hex");
assert.equal(sourceHash, "97a8bb7e95ad0538aaced88aba469fae3ba02d8045831538333a57711164ee69",
  "Public evaluation PDF does not match the reviewed source");
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
  const cases = [
    { pageNumber: 2, kind: "prose", tokens: ["Combining GnuCOBOL and C Programs", "Run-Time Library Requirements", "String Allocation Differences", "PIC X(15)"] },
    { pageNumber: 4, kind: "code", tokens: ["IDENTIFICATION DIVISION", "PROGRAM-ID", "WORKING-STORAGE SECTION", "BINARY-INT", "PROCEDURE DIVISION", "31415926", "STOP RUN RETURNING 0"] },
  ];
  const measurements = await page.evaluate(async ({ bytes, cases }) => {
    await import("/src/adapters/pdf_ocr_crop.ts");
    const { getDocument, GlobalWorkerOptions } = await import("/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
    GlobalWorkerOptions.workerSrc = (await import("/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
    const { TesseractLocalOcrEngine } = await import("/src/adapters/tesseract_local_ocr.ts");
    const task = getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, isEvalSupported: false });
    const pdf = await task.promise;
    const results = [];
    try {
      for (const item of cases) {
        if (item.pageNumber > pdf.numPages) throw new Error("Expected page missing");
        const pdfPage = await pdf.getPage(item.pageNumber);
        const viewport = pdfPage.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        if (canvas.width * canvas.height > 4_000_000) throw new Error("Page exceeds OCR pixel limit");
        await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const image = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed")), "image/png"));
        const text = await new TesseractLocalOcrEngine().recognize(image, new AbortController().signal);
        const normalized = text.toUpperCase().replace(/\s+/g, " ");
        results.push({ pageNumber: item.pageNumber, kind: item.kind, width: canvas.width, height: canvas.height,
          textLength: text.length, matched: item.tokens.filter(token => normalized.includes(token.toUpperCase())),
          missing: item.tokens.filter(token => !normalized.includes(token.toUpperCase())),
          stopRunLine: item.kind === "code" ? text.split(/\r?\n/).find(line => /STOP\s+RUN/i.test(line)) ?? null : null });
        pdfPage.cleanup();
      }
    } finally { await task.destroy(); }
    return results;
  }, { bytes: Array.from(pdfBytes), cases });
  assert.deepEqual(foreignRequests, []);
  console.log(JSON.stringify({ sourceHash: `sha256:${sourceHash}`, pages: measurements, foreignRequests: foreignRequests.length }, null, 2));
  assert.deepEqual(measurements.map(item => [item.matched.length, item.missing.length]), [[4, 0], [6, 1]],
    "OCR results differ from the documented public baseline; inspect the JSON above");
  assert.deepEqual(measurements[1].missing, ["STOP RUN RETURNING 0"],
    "The documented code-token mismatch changed; inspect the JSON above");
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([once(server, "exit"), delay(5_000)]);
}

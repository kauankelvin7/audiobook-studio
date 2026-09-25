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
await new Promise((resolveClose, reject) => probe.close(error => error ? reject(error) : resolveClose()));
const baseUrl = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: process.cwd(), stdio: "ignore", windowsHide: true });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("Vite encerrou antes do teste.");
    try { if ((await fetch(baseUrl)).ok) { ready = true; break; } } catch { /* Aguarda servidor. */ }
    await delay(200);
  }
  assert.ok(ready, "Vite não iniciou em 20 segundos.");
  browser = await chromium.launch({ channel: process.env.AUDIO_BROWSER_CHANNEL ?? "chrome", headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl);
  const bytes = [...new Uint8Array(await readFile(resolve("../../tests/fixtures/text_and_blank.pdf")))];
  const result = await page.evaluate(async input => {
    await import("/src/adapters/pdf_ocr_crop.ts");
    const { extractPdf } = await import("/src/adapters/pdf.ts");
    const { analyzeDocumentV1 } = await import("/src/adapters/rust_content_pipeline.ts");
    const { capturePdfOcrRegion } = await import("/src/adapters/pdf_ocr_crop.ts");
    const { getDocument, AnnotationMode, GlobalWorkerOptions } = await import("/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
    GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs";
    const bytes = new Uint8Array(input);
    const v1 = await extractPdf(bytes);
    const { documentV2 } = await analyzeDocumentV1(v1);
    const region = documentV2.pages[0].regions.find(item => item.bbox && item.sources.rawText);
    if (!region) throw new Error("Fixture não contém região com bbox e texto nativo.");
    const crop = await capturePdfOcrRegion(bytes, documentV2, 1, region.id);
    const image = await createImageBitmap(crop.image);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let darkPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 150 && pixels[index + 1] < 150 && pixels[index + 2] < 150) darkPixels++;
    }
    const loading = getDocument({ data: bytes.slice(), stopAtErrors: true });
    const pdf = await loading.promise;
    const sourcePage = await pdf.getPage(1);
    const viewport = sourcePage.getViewport({ scale: crop.renderScale });
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = Math.ceil(viewport.width);
    fullCanvas.height = Math.ceil(viewport.height);
    await sourcePage.render({ canvas: fullCanvas, viewport, annotationMode: AnnotationMode.DISABLE }).promise;
    const bounds = viewport.convertToViewportRectangle(region.bbox);
    const left = Math.floor(Math.min(bounds[0], bounds[2]));
    const top = Math.floor(Math.min(bounds[1], bounds[3]));
    const referencePixels = fullCanvas.getContext("2d").getImageData(left, top, crop.pixelWidth, crop.pixelHeight).data;
    let differentChannels = 0;
    for (let index = 0; index < pixels.length; index++) if (pixels[index] !== referencePixels[index]) differentChannels++;
    await loading.destroy();
    image.close();
    let mismatch;
    const changed = bytes.slice(); changed[changed.length - 3] ^= 1;
    try { await capturePdfOcrRegion(changed, documentV2, 1, region.id); } catch (error) { mismatch = error.code; }
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    const abortController = new AbortController();
    HTMLCanvasElement.prototype.toBlob = function () { abortController.abort(); };
    let cancelledDuringEncoding;
    try {
      await capturePdfOcrRegion(bytes, documentV2, 1, region.id, abortController.signal);
    } catch (error) { cancelledDuringEncoding = error.code; }
    finally { HTMLCanvasElement.prototype.toBlob = originalToBlob; }
    return { imageHash: crop.imageHash, imageType: crop.image.type, imageSize: crop.image.size,
      pixelWidth: crop.pixelWidth, pixelHeight: crop.pixelHeight, darkPixels, differentChannels, mismatch, cancelledDuringEncoding,
      sourceHashMatches: crop.sourceHash === documentV2.sourceHash,
      nativeHash: crop.nativeTextHash };
  }, bytes);
  assert.match(result.imageHash, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.nativeHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.imageType, "image/png");
  assert.ok(result.imageSize > 100 && result.pixelWidth > 0 && result.pixelHeight > 0 && result.darkPixels > 0);
  assert.equal(result.differentChannels, 0, "Crop não coincide com os pixels da mesma região renderizada na página inteira.");
  assert.equal(result.sourceHashMatches, true);
  assert.equal(result.mismatch, "SOURCE_MISMATCH");
  assert.equal(result.cancelledDuringEncoding, "CANCELLED");
  console.log(`PASS crop ${result.pixelWidth}x${result.pixelHeight} PNG=${result.imageSize}B darkPixels=${result.darkPixels}`);
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([once(server, "exit"), delay(5_000)]);
}

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const foreignRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  context.on("request", request => {
    if (!request.url().startsWith(baseUrl) && !request.url().startsWith("blob:")) foreignRequests.push(request.url());
  });
  await page.goto(baseUrl);
  const pdfBytes = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 612;
    canvas.height = 792;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 612, 792);
    ctx.fillStyle = "black";
    ctx.font = "bold 58px Arial";
    ctx.fillText("COBOL STUDIO", 48, 150);
    const jpeg = Uint8Array.from(atob(canvas.toDataURL("image/jpeg", 0.95).split(",")[1]), char => char.charCodeAt(0));
    const enc = new TextEncoder();
    const chunks = [];
    let length = 0;
    const offsets = [0];
    const add = bytes => { chunks.push(bytes); length += bytes.length; };
    const write = text => add(enc.encode(text));
    write("%PDF-1.4\n");
    const object = (id, before, binary, after = "\nendstream\n") => {
      offsets[id] = length;
      write(`${id} 0 obj\n${before}`);
      if (binary) add(binary);
      write(binary ? `${after}endobj\n` : "endobj\n");
    };
    object(1, "<< /Type /Catalog /Pages 2 0 R >>\n");
    object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
    object(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n");
    object(4, `<< /Type /XObject /Subtype /Image /Width 612 /Height 792 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg);
    const content = enc.encode("q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ\n");
    object(5, `<< /Length ${content.length} >>\nstream\n`, content);
    const startXref = length;
    write("xref\n0 6\n0000000000 65535 f \n");
    for (let id = 1; id <= 5; id++) write(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    write(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);
    const pdf = new Uint8Array(length);
    let position = 0;
    for (const chunk of chunks) { pdf.set(chunk, position); position += chunk.length; }
    return Array.from(pdf);
  });
  await page.locator("#pdf-input").setInputFiles({ name: "synthetic-scanned.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdfBytes) });
  await page.getByText(/Progresso salvo neste dispositivo/).waitFor({ timeout: 30_000 });
  await page.locator("#ocr-page").selectOption("1");
  await page.locator("#ocr-region").selectOption("__page__");
  assert.equal(await page.getByRole("radio", { name: "Manter o texto extraído" }).count(), 0);
  await page.getByRole("button", { name: "Gerar candidato OCR" }).click();
  await page.getByText("Candidato OCR salvo. Compare os textos antes de registrar uma decisão.").waitFor({ timeout: 90_000 });
  assert.match(await page.getByLabel("Texto candidato do OCR").innerText(), /COBOL/i);
  assert.equal(await page.getByText("Sem texto extraído nesta página.").count(), 1);
  await page.locator("#ocr-rationale").fill("Transcrição sintética; conferência humana pendente.");
  await page.getByRole("button", { name: "Salvar revisão" }).click();
  await page.getByText("Revisão salva como não verificada. O texto do documento não foi alterado.").waitFor({ timeout: 30_000 });
  await page.reload();
  await page.getByRole("button", { name: /Abrir revisão OCR salva em/ }).first().click();
  await page.getByText("Revisão histórica aberta. Atualidade e identidade do revisor não foram verificadas.").waitFor({ timeout: 30_000 });
  assert.equal(await page.locator("#ocr-region").inputValue(), "__page__");
  assert.deepEqual(errors, []);
  assert.deepEqual(foreignRequests, []);
  console.log("PASS scanned-page OCR image-only PDF/capture/receipt/save/reload/open unverified foreignRequests=0");
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([once(server, "exit"), delay(5_000)]);
}

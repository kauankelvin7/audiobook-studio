import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

function twoPagePdf() {
  const first = "BT /F1 16 Tf 72 700 Td (Primeira pagina do livro. Texto completo.) Tj ET";
  const second = "BT /F1 16 Tf 72 700 Td (Segunda pagina do livro. Fim do texto.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
    `<< /Length ${Buffer.byteLength(first)} >>\nstream\n${first}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R >>",
    `<< /Length ${Buffer.byteLength(second)} >>\nstream\n${second}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

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
    if (server.exitCode !== null) throw new Error("Vite terminou antes do smoke.");
    try { if ((await fetch(baseUrl)).ok) { ready = true; break; } } catch { /* wait */ }
    await delay(200);
  }
  assert.ok(ready, "Vite não iniciou.");
  browser = await chromium.launch({ channel: process.env.AUDIO_BROWSER_CHANNEL ?? "chrome", headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.getByLabel("Arquivo PDF").setInputFiles({ name: "livro-completo.pdf", mimeType: "application/pdf", buffer: twoPagePdf() });
  await page.getByText("2 páginas importadas.", { exact: false }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Gerar audiobook completo em WAV" }).click();
  await page.getByText("Audiobook completo salvo neste dispositivo.", { exact: false }).waitFor({ timeout: 600_000 });
  const player = page.getByLabel("Audiobook completo");
  await player.waitFor();
  const duration = await player.evaluate(async audio => {
    if (audio.readyState < 1) await new Promise((resolveReady, reject) => {
      audio.addEventListener("loadedmetadata", resolveReady, { once: true });
      audio.addEventListener("error", () => reject(new Error("WAV final não decodificou.")), { once: true });
    });
    await audio.play();
    return audio.duration;
  });
  assert.ok(Number.isFinite(duration) && duration > 0, "Duração do audiobook inválida.");
  await page.getByRole("button", { name: "Próximo capítulo" }).click();
  assert.ok(await player.evaluate(audio => audio.currentTime) > 0, "O player não avançou para o segundo capítulo.");
  await page.getByRole("button", { name: "Capítulo anterior" }).click();
  await page.waitForFunction(() => document.querySelector('audio[aria-label="Audiobook completo"]')?.currentTime > 0.2,
    null, { timeout: 10_000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar audiobook completo em WAV" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "audiobook-studio-completo.wav");
  if (process.env.AUDIO_SMOKE_OUTPUT) await download.saveAs(resolve(process.env.AUDIO_SMOKE_OUTPUT));
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
  assert.ok(bytes.length > 44_100, "Download não contém áudio suficiente.");
  const manifestDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar índice e manifesto do audiobook" }).click();
  const manifestFile = await manifestDownload;
  if (process.env.AUDIO_SMOKE_MANIFEST_OUTPUT) await manifestFile.saveAs(resolve(process.env.AUDIO_SMOKE_MANIFEST_OUTPUT));
  const manifest = JSON.parse(await (async () => {
    const pieces = [];
    for await (const piece of await manifestFile.createReadStream()) pieces.push(piece);
    return Buffer.concat(pieces).toString("utf8");
  })());
  assert.equal(manifest.audioHash, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
  assert.match(manifest.documentHash, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(manifest.chapters.map(chapter => chapter.pageNumber), [1, 2]);
  await page.reload();
  await page.getByRole("link", { name: "Baixar audiobook completo em WAV" }).waitFor({ timeout: 60_000 });
  assert.equal(await page.locator('audio[aria-label="Audiobook completo"]').count(), 1);
  assert.equal(await page.locator("#complete-audio-title + p").count(), 1);
  console.log(`PASS complete PDF to WAV pages=2 bytes=${bytes.length} duration=${duration.toFixed(2)}s reload=ok`);
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([once(server, "exit"), delay(5_000)]);
}

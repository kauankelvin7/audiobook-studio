import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));
const baseUrl = `http://127.0.0.1:${port}/`;
const vite = resolve("node_modules/vite/bin/vite.js");
const fixture = resolve("../../tests/fixtures/text_and_blank.pdf");
const browserChannel = process.env.AUDIO_BROWSER_CHANNEL ?? "chrome";
const server = spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: process.cwd(), stdio: "ignore", windowsHide: true,
});
let browser;

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("Vite encerrou antes do teste.");
    try {
      const response = await fetch(baseUrl);
      if (response.ok) { ready = true; break; }
    } catch { /* Aguarda a porta abrir. */ }
    await delay(200);
  }
  assert.ok(ready, "Vite não iniciou em 20 segundos.");
  browser = await chromium.launch({ channel: browserChannel, headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.getByLabel("Arquivo PDF").setInputFiles(fixture);
  await page.getByText(/páginas? importadas?/).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Preparar leitura" }).click();
  await page.getByLabel("Conferi o texto de todas as páginas selecionadas.").check();
  await page.getByRole("button", { name: "Gerar WAV" }).click();
  await page.getByText("Preparando a voz neste dispositivo.", { exact: false }).waitFor();
  await page.getByText("WAV pronto e salvo neste dispositivo.", { exact: false }).waitFor({ timeout: 300_000 });
  await page.getByRole("button", { name: "Gerar WAV" }).click();
  await page.getByText("Preparando a voz neste dispositivo.", { exact: false }).waitFor();
  await page.getByText("WAV pronto e salvo neste dispositivo.", { exact: false }).waitFor({ timeout: 300_000 });
  await page.reload();
  await page.getByRole("heading", { name: "Gravações neste dispositivo" }).waitFor({ timeout: 30_000 });
  await page.locator(".audio-history li").nth(1).waitFor();
  assert.equal(await page.locator(".audio-history li").count(), 2, "Catálogo não reteve as duas gravações.");
  await page.locator(".audio-history li").nth(1).getByRole("button", { name: /^Abrir gravação/i }).click();
  const audio = page.getByLabel("Gravação WAV selecionada");
  await audio.waitFor();
  const duration = await audio.evaluate(async element => {
    const media = element;
    if (media.readyState < 1) await new Promise((resolve, reject) => {
      media.addEventListener("loadedmetadata", resolve, { once: true });
      media.addEventListener("error", () => reject(new Error("WAV não decodificado.")), { once: true });
    });
    await media.play();
    return media.duration;
  });
  assert.ok(Number.isFinite(duration) && duration > 0, "Duração WAV inválida.");
  await page.waitForFunction(() => document.querySelector('audio[aria-label="Gravação WAV selecionada"]')?.currentTime > 0.25,
    null, { timeout: 10_000 });
  const blobHash = await audio.evaluate(async element => {
    const bytes = await (await fetch(element.currentSrc)).arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  });
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("link", { name: "Baixar WAV selecionado" }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.wav$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  assert.ok(bytes.length >= 46, "Download WAV vazio.");
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), blobHash, "Download difere do WAV reproduzido.");
  const oldFiles = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("audiobook-studio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise((resolve, reject) => {
      const request = database.transaction("artifacts", "readonly").objectStore("artifacts").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    const audio = records.filter(record => record.kind === "audio_chunk" && /^literal_wav_[0-9a-f]{32}$/.test(record.artifactKey))
      .sort((left, right) => right.createdAtMs - left.createdAtMs || right.artifactKey.localeCompare(left.artifactKey));
    const older = audio[1];
    return records.filter(record => record.artifactKey === older?.artifactKey || record.artifactKey === `${older?.artifactKey}_meta`)
      .map(record => record.fileName);
  });
  assert.equal(oldFiles.length, 2);
  assert.equal(await page.locator(".audio-history li").first().getByRole("button", { name: /^Excluir gravação/i }).count(), 0);
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator(".audio-history li").nth(1).getByRole("button", { name: /^Excluir gravação/i }).click();
  assert.equal(await page.locator(".audio-history li").count(), 2, "Cancelar a confirmação removeu gravação.");
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".audio-history li").nth(1).getByRole("button", { name: /Excluir gravação/i }).click();
  await page.getByText("Gravação antiga removida.", { exact: false }).waitFor();
  await page.reload();
  await page.locator(".audio-history li").first().waitFor();
  assert.equal(await page.locator(".audio-history li").count(), 1);
  const cleanup = await page.evaluate(async fileNames => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("audiobook-studio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = storeName => new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [checkpoints, artifacts, pending] = await Promise.all([
      read("checkpoints"), read("artifacts"), read("pending_file_deletions"),
    ]);
    database.close();
    const root = await navigator.storage.getDirectory();
    const oldFileExists = await Promise.all(fileNames.map(async name => {
      try { await root.getFileHandle(name); return true; } catch { return false; }
    }));
    return { checkpoints: checkpoints.length, audio: artifacts.filter(record => record.kind === "audio_chunk").length,
      pending: pending.length, oldFileExists };
  }, oldFiles);
  assert.deepEqual(cleanup, { checkpoints: 2, audio: 1, pending: 0, oldFileExists: [false, false] });
  console.log(`PASS browser=${browserChannel} duration=${duration.toFixed(2)}s download=${bytes.length}B`);
} finally {
  try {
    await browser?.close();
  } finally {
    server.kill();
    if (server.exitCode === null) await Promise.race([once(server, "exit"), delay(5_000)]);
  }
}

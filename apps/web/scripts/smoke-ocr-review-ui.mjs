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
  await page.locator("#pdf-input").setInputFiles(resolve("../../tests/fixtures/text_and_blank.pdf"));
  await page.getByText(/Progresso salvo neste dispositivo/).waitFor({ timeout: 30_000 });
  await page.locator("#ocr-page").selectOption("1");
  const regionValue = await page.locator("#ocr-region option").evaluateAll(options =>
    options.find(option => option.textContent?.includes("Capitulo"))?.value ?? "");
  assert.ok(regionValue, "Expected title region missing");
  await page.locator("#ocr-region").selectOption(regionValue);
  await page.getByRole("button", { name: "Gerar candidato OCR" }).click();
  await page.getByText("Candidato OCR salvo. Compare os textos antes de registrar uma decisão.").waitFor({ timeout: 90_000 });
  assert.equal(await page.getByText(/Estado: revisão necessária/).count(), 1);
  await page.locator("#ocr-rationale").fill("Conferência visual pendente.");
  await page.getByRole("button", { name: "Salvar revisão" }).click();
  await page.getByText("Revisão salva como não verificada. O texto do documento não foi alterado.").waitFor({ timeout: 30_000 });
  await page.reload();
  await page.getByRole("button", { name: /Abrir revisão OCR salva em/ }).first().waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /Abrir revisão OCR salva em/ }).first().click();
  await page.getByText("Revisão histórica aberta. Atualidade e identidade do revisor não foram verificadas.").waitFor({ timeout: 30_000 });
  assert.equal(await page.locator("#ocr-rationale").inputValue(), "Conferência visual pendente.");
  assert.equal(await page.getByText(/Estado: revisão necessária/).count(), 1);
  await page.getByRole("radio", { name: "Propor texto corrigido" }).check();
  await page.locator("#ocr-rationale").fill("Texto conferido visualmente no PDF de teste.");
  await page.locator("#ocr-proposed-text").fill("Capitulo de teste");
  await page.getByRole("button", { name: "Salvar revisão" }).click();
  await page.getByText("Revisão salva como não verificada.", { exact: false }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Aprovar texto corrigido para análise" }).click();
  await page.locator(".notice [role=status]").last().waitFor({ timeout: 30_000 });
  await page.getByText("Texto aprovado e roteiro preliminar salvo.", { exact: false }).waitFor({ timeout: 30_000 });
  await page.getByLabel("Texto da narração").fill("O capítulo apresenta o teste do livro em uma frase para ouvir.");
  await page.getByRole("button", { name: "Conferir roteiro" }).click();
  await page.getByText("Conferência concluída.", { exact: false }).waitFor({ timeout: 30_000 });
  await page.locator("#narrative-rationale").fill("Conferi o texto narrado com a página de teste.");
  await page.getByRole("checkbox", { name: /Conferi o roteiro com o texto aprovado/ }).check();
  await page.getByRole("button", { name: "Aprovar roteiro para áudio" }).click();
  await page.getByText(/Ainda há páginas sem texto aprovado/).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Gerar audiobook narrativo em WAV" }).click();
  await page.getByText(/Aprove um roteiro narrativo antes de gerar o WAV/).waitFor({ timeout: 30_000 });
  await page.reload();
  await page.getByRole("button", { name: /Abrir revisão OCR salva em/ }).first().click();
  await page.getByRole("button", { name: "Aprovar texto corrigido para análise" }).click();
  await page.getByText("Texto aprovado e roteiro preliminar salvo.", { exact: false }).waitFor({ timeout: 30_000 });
  assert.deepEqual(errors, []);
  assert.ok(foreignRequests.every(url => {
    const host = new URL(url).hostname;
    return host === "huggingface.co" || host === "us.aws.cdn.hf.co";
  }), "OCR or narrative pipeline requested an unexpected external origin");
  console.log(`PASS OCR review UI canonical/plan/script/QA/incomplete-page-block/reload modelRequests=${foreignRequests.length}`);
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([once(server, "exit"), delay(5_000)]);
}

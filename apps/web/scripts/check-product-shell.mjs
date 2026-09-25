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
const server = spawn(process.execPath, [
  resolve("node_modules/vite/bin/vite.js"),
  "--host", "127.0.0.1",
  "--port", String(port),
  "--strictPort",
], { cwd: process.cwd(), stdio: "ignore" });

let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(baseUrl)).ok) { ready = true; break; }
    } catch {
      // Aguarda o Vite aceitar conexões.
    }
    await delay(200);
  }
  assert.ok(ready, "Vite did not start");

  browser = await chromium.launch({ channel: "chrome", headless: true });

  for (const [width, height] of [
    [1920, 1080],
    [1440, 960],
    [1320, 900],
    [1120, 900],
    [900, 900],
    [768, 900],
    [739, 900],
    [390, 844],
    [320, 760],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Do documento à voz." }).waitFor();

    const shell = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      mobileNav: getComputedStyle(document.querySelector(".mobile-nav")).display,
      sidebar: getComputedStyle(document.querySelector(".studio-sidebar")).display,
    }));
    assert.ok(shell.content <= shell.viewport + 1, `shell overflow at ${width}px: ${JSON.stringify(shell)}`);
    assert.equal(shell.mobileNav === "none", width >= 740);
    assert.equal(shell.sidebar === "none", width < 740);
    assert.deepEqual(errors, []);

    await page.locator("#pdf-input").setInputFiles(resolve("../../tests/fixtures/text_and_blank.pdf"));
    await page.getByText(/Progresso salvo neste dispositivo/).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Próxima página" }).click();

    await page.evaluate(() => { location.hash = "#review"; });
    await page.waitForTimeout(120);

    const review = await page.evaluate(() => {
      const documentWorkspace = document.querySelector(".document-workspace");
      const inspector = document.querySelector(".evidence-inspector");
      const mobileNav = document.querySelector(".mobile-nav");
      return {
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
        workspaceWidth: documentWorkspace?.getBoundingClientRect().width ?? 0,
        inspectorWidth: inspector?.getBoundingClientRect().width ?? 0,
        mobileNavPosition: mobileNav ? getComputedStyle(mobileNav).position : "none",
      };
    });

    assert.ok(review.content <= review.viewport + 1, `review overflow at ${width}px: ${JSON.stringify(review)}`);
    assert.ok(review.workspaceWidth > 0, `document workspace collapsed at ${width}px`);
    assert.ok(review.inspectorWidth > 0, `evidence inspector collapsed at ${width}px`);
    if (width < 740) assert.equal(review.mobileNavPosition, "fixed");

    await page.evaluate(() => { location.hash = "#narrative"; });
    await page.waitForTimeout(80);
    const production = await page.evaluate(() => {
      const grid = document.querySelector(".production-grid");
      const narrative = document.querySelector("#narrative");
      const audio = document.querySelector("#audio");
      return {
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
        gridWidth: grid?.getBoundingClientRect().width ?? 0,
        narrativeWidth: narrative?.getBoundingClientRect().width ?? 0,
        audioWidth: audio?.getBoundingClientRect().width ?? 0,
      };
    });
    assert.ok(production.content <= production.viewport + 1, `production overflow at ${width}px: ${JSON.stringify(production)}`);
    assert.ok(production.narrativeWidth >= production.gridWidth - 2, `narrative compressed at ${width}px: ${JSON.stringify(production)}`);
    assert.ok(production.audioWidth >= production.gridWidth - 2, `audio compressed at ${width}px: ${JSON.stringify(production)}`);

    if (width === 1440 || width === 390) {
      await page.evaluate(() => { location.hash = "#review"; });
      await page.waitForTimeout(80);
      await page.screenshot({ path: resolve(`../../work/leve-inspired-review-${width}.png`), fullPage: true });
    }

    assert.deepEqual(errors, []);
    console.log(`PASS shell/review/production ${width}x${height} overflow=0`);
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill();
  await Promise.race([once(server, "exit"), delay(5_000)]);
}

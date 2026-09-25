import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
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

    await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
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
    await page.getByRole("button", { name: "Página 2" }).first().click();

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

    if (width === 1440 || width === 390) {
      await page.screenshot({ path: resolve(`../../work/leve-inspired-review-${width}.png`), fullPage: true });
    }

    console.log(`PASS shell/review ${width}x${height} overflow=0`);
    await page.close();
  }
} finally {
  await browser.close();
}

import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const [width, height] of [[1920, 1080], [1440, 960], [1280, 800], [768, 900], [390, 844], [360, 780], [320, 760]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Do documento à voz." }).waitFor();
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      mobileNav: getComputedStyle(document.querySelector(".mobile-nav")).display,
      sidebar: getComputedStyle(document.querySelector(".studio-sidebar")).display,
    }));
    assert.ok(layout.content <= layout.viewport + 1, `overflow at ${width}px: ${JSON.stringify(layout)}`);
    assert.equal(layout.mobileNav === "none", width > 780);
    assert.equal(layout.sidebar === "none", width <= 780);
    assert.deepEqual(errors, []);
    if (width === 1440 || width === 390) await page.screenshot({ path: resolve(`../../work/product-shell-${width}.png`), fullPage: true });
    console.log(`PASS shell ${width}x${height} overflow=0 navigation=visible`);
    {
      await page.locator("#pdf-input").setInputFiles(resolve("../../tests/fixtures/text_and_blank.pdf"));
      await page.getByText(/Progresso salvo neste dispositivo/).waitFor({ timeout: 30_000 });
      if (width === 1440 || width === 390) await page.screenshot({ path: resolve(`../../work/product-workspace-text-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Página 2" }).first().click();
      const loaded = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth }));
      assert.ok(loaded.content <= loaded.viewport + 1, `loaded overflow at ${width}px: ${JSON.stringify(loaded)}`);
      if (width === 1440 || width === 390) await page.screenshot({ path: resolve(`../../work/product-workspace-${width}.png`), fullPage: true });
      console.log(`PASS workspace ${width}x${height} pages=native overflow=0`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}

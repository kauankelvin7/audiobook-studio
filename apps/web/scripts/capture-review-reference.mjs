import { resolve } from "node:path";
import { chromium } from "playwright-core";

const [requestedWidth, requestedHeight, requestedOutput] = process.argv.slice(2);
const target = requestedOutput ? resolve(requestedOutput) : process.env.REVIEW_SCREENSHOT_OUTPUT ?? resolve("../../work/review-reference-1440.png");
const width = Number(requestedWidth ?? process.env.REVIEW_SCREENSHOT_WIDTH ?? 1440);
const height = Number(requestedHeight ?? process.env.REVIEW_SCREENSHOT_HEIGHT ?? 960);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://localhost:5173/#review", { waitUntil: "networkidle" });
  await page.locator("#pdf-input").setInputFiles(resolve("../../work/public-eval/gnucobol-c-interaction.pdf"));
  await page.getByText(/páginas importadas/i).waitFor({ state: "attached", timeout: 60_000 });
  await page.locator("#ocr-page").selectOption({ index: 1 });
  await page.locator("#ocr-region").selectOption({ index: 1 });
  await page.screenshot({ path: target });
  const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, text: document.body.innerText.length }));
  if (layout.scroll > layout.width + 1) throw new Error(`Horizontal overflow: ${layout.scroll}px at ${layout.width}px`);
  if (errors.length) throw new Error(`Page errors: ${errors.join(" | ")}`);
  console.log(`PASS review screenshot ${target} text=${layout.text} overflow=0`);
} finally { await browser.close(); }

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  return [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(part => Number.parseInt(part, 16)) as Rgb;
}

function luminance(hex: string) {
  return rgb(hex).map(value => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index]!, 0);
}

function contrast(left: string, right: string) {
  const [lighter = 0, darker = 0] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("qualidade visual base", () => {
  const root = resolve(import.meta.dirname, "..");
  const tokens = readFileSync(resolve(root, "src/styles/tokens.css"), "utf8");
  const shell = readFileSync(resolve(root, "src/styles/shell.css"), "utf8");
  const accessibility = readFileSync(resolve(root, "src/styles/accessibility.css"), "utf8");
  const editorial = readFileSync(resolve(root, "src/styles/editorial.css"), "utf8");
  const production = readFileSync(resolve(root, "src/styles/production.css"), "utf8");
  const workspace = readFileSync(resolve(root, "src/DocumentWorkspace.tsx"), "utf8");
  const pdfViewer = readFileSync(resolve(root, "src/PdfOriginalPage.tsx"), "utf8");
  const main = readFileSync(resolve(root, "src/main.tsx"), "utf8");

  it("mantém contraste AA na base e na workstation editorial", () => {
    expect(contrast("#f4f6f8", "#0b0d12")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#18222e", "#e7eaed")).toBeGreaterThanOrEqual(4.5);
    expect(tokens).toContain("--color-ink: #f4f6f8");
    expect(editorial).toContain("--color-ink: #f4f7fa");
    expect(editorial).toContain("--color-canvas: #090d13");
  });

  it("não volta a prender a revisão em altura fixa com conteúdo oculto", () => {
    expect(shell).not.toContain("calc(100vh - 64px - 232px)");
    expect(shell).not.toMatch(/\.review-mode\s+\.editor-grid\s*\{[^}]*height\s*:/s);
    expect(shell).toContain("max-height: calc(100dvh - 118px)");
  });

  it("mantém composição móvel com safe area e fallback de transparência", () => {
    expect(shell).toContain("env(safe-area-inset-bottom)");
    expect(shell).toContain("@supports not");
    expect(accessibility).toContain("prefers-reduced-transparency");
    expect(accessibility).toContain("prefers-reduced-motion");
  });

  it("carrega estilos específicos de produção e a identidade editorial final", () => {
    expect(main).toContain('import "./styles/production.css"');
    expect(main).toContain('import "./styles/editorial.css"');
    expect(editorial).toContain(".studio-sidebar");
    expect(editorial).toContain(".review-bottom-dock");
    expect(editorial).toContain("color-scheme: dark");
    expect(editorial).not.toContain("color-scheme: light");
    expect(production).toContain(".progressive-audio");
    expect(production).toContain(".audio-generation-loader");
  });

  it("não comprime Narrativa e Áudio lado a lado na grade externa", () => {
    expect(shell).toMatch(/\.production-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    expect(shell).not.toMatch(/\.production-grid\s*\{[^}]*repeat\(2/s);
  });

  it("mantém o leitor com zoom útil e composição responsiva própria", () => {
    expect(workspace).toContain('"fit-width"');
    expect(workspace).toContain('"fit-page"');
    expect(workspace).toContain("300");
    expect(workspace).toContain("pagePanelOpen");
    expect(pdfViewer).toContain("PDF_CSS_UNITS");
    expect(pdfViewer).toContain("MAX_RASTER_PIXELS");
    expect(shell).toContain("@media (min-width: 740px) and (max-width: 1540px)");
    expect(shell).toContain(".document-workspace.pages-open");
  });
});

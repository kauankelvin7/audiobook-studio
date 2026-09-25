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
  const main = readFileSync(resolve(root, "src/main.tsx"), "utf8");

  it("mantém contraste AA para texto principal no canvas", () => {
    expect(contrast("#f4f6f8", "#0b0d12")).toBeGreaterThanOrEqual(4.5);
    expect(tokens).toContain("--color-ink: #f4f6f8");
    expect(tokens).toContain("--color-canvas: #0b0d12");
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

  it("carrega estilos específicos de produção em vez de depender de painel genérico", () => {
    expect(main).toContain('import "./styles/production.css"');
  });
});

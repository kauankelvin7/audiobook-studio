import { describe, expect, it } from "vitest";
import { assembleTextPage, markRepeatedMargins, type PageBounds } from "./pdf_layout";

type Item = Parameters<typeof assembleTextPage>[0][number];
function item(str: string, x: number, y: number, hasEOL = false): Item {
  return { str, transform: [1, 0, 0, 1, x, y], width: str.length * 5, height: 10, hasEOL };
}

const bounds: PageBounds = { minY: 0, maxY: 800, rotation: 0 };

describe("conservative PDF layout", () => {
  it("joins adjacent runs, honors empty EOL markers and retains raw text", () => {
    const page = assembleTextPage([item("Primeira", 40, 760), item("linha", 85, 760), item("", 40, 730, true), item("Segunda linha", 40, 730)], 1);
    expect(page.blocks.map(block => block.text)).toEqual(["Primeira linha", "Segunda linha"]);
    expect(page.blocks.map(block => block.id)).toEqual(["p1-t1", "p1-t4"]);
    expect(page.rawText).toContain("Primeira linha");
    expect(page.blocks.every(block => block.confidence === null && block.type === "unknown")).toBe(true);
  });

  it("keeps distant columns separate without reordering", () => {
    const page = assembleTextPage([item("Esquerda", 40, 400), item("Direita", 320, 400)], 1);
    expect(page.blocks.map(block => block.text)).toEqual(["Esquerda", "Direita"]);
  });

  it("flags repeated margin candidates across pages without removing text", () => {
    const pages = [1, 2, 3].map(number => assembleTextPage([
      item("Manual de teste", 40, 770, true), item(`Conteúdo ${number}`, 40, 400, true), item("Rodapé comum", 40, 30),
    ], number));
    const marked = markRepeatedMargins(pages, [bounds, bounds, bounds]);
    expect(marked.every(page => page.blocks[0].flags.includes("repeated_header_candidate"))).toBe(true);
    expect(marked.every(page => page.blocks[2].flags.includes("repeated_footer_candidate"))).toBe(true);
    expect(marked.every(page => page.blocks[1].flags.length === 1)).toBe(true);
    expect(marked.map(page => page.rawText)).toEqual(pages.map(page => page.rawText));
    expect(marked.flatMap(page => page.blocks.map(block => block.text))).toEqual(pages.flatMap(page => page.blocks.map(block => block.text)));
  });

  it("does not infer noise from two pages, central text or rotated geometry", () => {
    const pages = [1, 2, 3].map(number => assembleTextPage([item("Título comum", 40, 400)], number));
    expect(markRepeatedMargins(pages.slice(0, 2), [bounds, bounds])).toEqual(pages.slice(0, 2));
    expect(markRepeatedMargins(pages, [bounds, bounds, bounds]).every(page => page.blocks[0].flags.length === 1)).toBe(true);
    const topPages = [1, 2, 3].map(number => assembleTextPage([item("Título comum", 40, 770)], number));
    expect(markRepeatedMargins(topPages, Array(3).fill({ ...bounds, rotation: 90 })).every(page => page.blocks[0].flags.length === 1)).toBe(true);
  });
});

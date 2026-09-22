import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { DocumentIr } from "../schemas/document";

type LayoutTextItem = Pick<TextItem, "str" | "transform" | "width" | "height" | "hasEOL">;
type Page = DocumentIr["pages"][number];
type Block = Page["blocks"][number];
export type PageBounds = { minY: number; maxY: number; rotation: number };

function itemBox(item: LayoutTextItem): Block["bbox"] {
  const x = Number(item.transform[4]);
  const y = Number(item.transform[5]);
  const box: [number, number, number, number] = [x, y, x + Math.abs(item.width), y + Math.abs(item.height)];
  return box.every(Number.isFinite) ? box : null;
}

function unionBox(first: Block["bbox"], second: Block["bbox"]): Block["bbox"] {
  if (!first || !second) return null;
  return [Math.min(first[0], second[0]), Math.min(first[1], second[1]), Math.max(first[2], second[2]), Math.max(first[3], second[3])];
}

export function assembleTextPage(items: LayoutTextItem[], pageNumber: number): Page {
  const rawText = items.map(item => item.str + (item.hasEOL ? "\n" : " ")).join("").trim();
  const blocks: Block[] = [];
  let current: Block | null = null;
  let previous: LayoutTextItem | null = null;

  function flush() {
    if (current) blocks.push(current);
    current = null;
    previous = null;
  }

  for (const [index, item] of items.entries()) {
    if (item.str.trim()) {
      const bbox = itemBox(item);
      const yGap = previous ? Math.abs(Number(item.transform[5]) - Number(previous.transform[5])) : 0;
      const xGap = previous ? Number(item.transform[4]) - (Number(previous.transform[4]) + Math.abs(previous.width)) : 0;
      if (current && previous && (yGap > Math.max(2, Math.abs(previous.height) * 0.35) || xGap > Math.max(24, Math.abs(previous.height) * 3) || xGap < -Math.max(24, Math.abs(previous.width) * 0.5))) {
        flush();
      }
      if (!current) {
        current = { id: `p${pageNumber}-t${index + 1}`, type: "unknown", language: null, text: item.str, confidence: null, bbox, flags: ["layout_unclassified"] };
      } else {
        current.text += current.text.endsWith(" ") || item.str.startsWith(" ") ? item.str : ` ${item.str}`;
        current.bbox = unionBox(current.bbox, bbox);
      }
      previous = item;
    }
    if (item.hasEOL) flush();
  }
  flush();
  return { number: pageNumber, rawText, textQuality: blocks.length ? "extracted" : "needs_ocr", blocks };
}

function marginZone(block: Block, bounds: PageBounds): "top" | "bottom" | null {
  if (!block.bbox || bounds.rotation % 360 !== 0 || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxY) || bounds.maxY <= bounds.minY) return null;
  const height = bounds.maxY - bounds.minY;
  const midpoint = (block.bbox[1] + block.bbox[3]) / 2;
  if (midpoint >= bounds.maxY - height * 0.1) return "top";
  if (midpoint <= bounds.minY + height * 0.1) return "bottom";
  return null;
}

export function markRepeatedMargins(pages: Page[], bounds: PageBounds[]): Page[] {
  if (pages.length < 3 || pages.length !== bounds.length) return pages;
  const key = (text: string, zone: "top" | "bottom") => `${zone}:${text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase()}`;
  const occurrences = new Map<string, Set<number>>();
  pages.forEach((page, index) => {
    for (const block of page.blocks) {
      const zone = marginZone(block, bounds[index]);
      if (!zone || block.text.trim().length < 4) continue;
      const candidate = key(block.text, zone);
      if (!occurrences.has(candidate)) occurrences.set(candidate, new Set());
      occurrences.get(candidate)!.add(index);
    }
  });
  const minimum = Math.max(3, Math.ceil(pages.length * 0.6));
  return pages.map((page, index) => ({
    ...page,
    blocks: page.blocks.map(block => {
      const zone = marginZone(block, bounds[index]);
      if (!zone || (occurrences.get(key(block.text, zone))?.size ?? 0) < minimum) return block;
      return { ...block, flags: [...block.flags, zone === "top" ? "repeated_header_candidate" : "repeated_footer_candidate"] };
    }),
  }));
}

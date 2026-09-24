/** Shows invisible formatting/control characters without changing the source bytes. */
export function visibleOcrText(value: string): string {
  return value.replace(/[\p{Cf}\p{Cc}]/gu, character => {
    if (character === "\n" || character === "\r" || character === "\t") return character;
    return `⟦U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}⟧`;
  });
}

export function hasHiddenOcrControls(value: string): boolean {
  return /[\p{Cf}\p{Cc}]/u.test(value.replace(/[\n\r\t]/g, ""));
}

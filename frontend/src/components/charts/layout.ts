// Pure layout maths for charts - no React, so it is unit-tested directly.

/** Split a label into lines of at most `maxChars`, breaking between words (long words are hard-split). */
export function wrapLabel(text: string, maxChars: number): string[] {
  const limit = Math.max(4, Math.floor(maxChars));
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > limit) {
      if (line) lines.push(line);
      for (let i = 0; i < word.length; i += limit) lines.push(word.slice(i, i + limit));
      line = lines.pop() ?? "";
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

const CHAR_PX = 6.6;   // average glyph width at 11-12px

/** Width for a category axis: fits the longest label, capped tighter on phones (labels then wrap). */
export function axisLabelWidth(labels: string[], compact: boolean): number {
  const longest = Math.max(0, ...labels.map((l) => l.length));
  const ideal = Math.ceil(longest * CHAR_PX) + 12;
  return Math.min(Math.max(ideal, 64), compact ? 104 : 168);
}

/** Bar chart height that grows with the number of rows (labels may wrap to two lines on phones). */
export function barChartHeight(rows: number, compact: boolean): number {
  return Math.max(120, rows * (compact ? 40 : 32) + 24);
}

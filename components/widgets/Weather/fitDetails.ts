import type { DetailRow } from './details';

export const LINE_EM = 2.15;
const CHAR_EM = 0.58;
const GAP_EM = 1.2;
const MAX_FONT_PX = 40;

/** Picks the column count that gives the largest text with nothing cut off. */
export function fitDetails(
  rows: readonly DetailRow[],
  labels: readonly string[],
  width: number,
  height: number
): { cols: number; lines: number; fontPx: number } {
  const widestEm = rows.reduce(
    (max, row, i) =>
      Math.max(max, (labels[i].length + row.value.length) * CHAR_EM + GAP_EM),
    0
  );
  let best = { cols: 1, lines: rows.length, fontPx: 0 };
  for (let cols = 1; cols <= Math.min(3, rows.length); cols++) {
    const lines = Math.ceil(rows.length / cols);
    const colGapPx = (cols - 1) * 0.06 * width;
    const fontPx = Math.min(
      MAX_FONT_PX,
      height / lines / LINE_EM,
      (width - colGapPx) / cols / widestEm
    );
    if (fontPx > best.fontPx + 0.5) best = { cols, lines, fontPx };
  }
  return best;
}

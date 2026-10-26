import type { DetailRow } from './details';

export type DetailsStyle = 'grid' | 'band';

// Cell box in em of the value text: padding, icon and the label line under or beside it.
const METRICS: Record<
  DetailsStyle,
  { padX: number; heightEm: number; iconEm: number; labelScale: number }
> = {
  grid: { padX: 1.1, heightEm: 3.0, iconEm: 1.7, labelScale: 0.5 },
  band: { padX: 0.9, heightEm: 4.0, iconEm: 0, labelScale: 0.5 },
};
const VALUE_CHAR_EM = 0.62;
const UNIT_SCALE = 0.5;
const LABEL_CHAR_EM = 0.78;
const MAX_FONT_PX = 44;

/** Picks the column count that gives the largest values with nothing cut off. */
export function fitDetails(
  rows: readonly DetailRow[],
  labels: readonly string[],
  width: number,
  height: number,
  style: DetailsStyle
): { cols: number; lines: number; fontPx: number } {
  const m = METRICS[style];
  const widestEm = rows.reduce((max, row, i) => {
    const valueEm =
      row.value.length * VALUE_CHAR_EM +
      (row.unit ? (row.unit.length + 0.5) * VALUE_CHAR_EM * UNIT_SCALE : 0);
    const labelEm = labels[i].length * LABEL_CHAR_EM * m.labelScale;
    return Math.max(max, Math.max(valueEm, labelEm) + m.iconEm + m.padX);
  }, 0);
  let best = { cols: 1, lines: rows.length, fontPx: 0 };
  for (let cols = 1; cols <= Math.min(4, rows.length); cols++) {
    const lines = Math.ceil(rows.length / cols);
    const fontPx = Math.min(
      MAX_FONT_PX,
      height / lines / m.heightEm,
      width / cols / widestEm
    );
    // A balanced grid reads better than a long single list, so more columns win close calls.
    if (fontPx > best.fontPx * (best.cols === 1 ? 0.8 : 1.02))
      best = { cols, lines, fontPx };
  }
  return best;
}

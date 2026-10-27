// Average glyph widths in em for the widget fonts; the layout effect corrects any overshoot.
const LABEL_CHAR_EM = 0.52;
const VALUE_CHAR_EM = 0.6;
const LINE_EM = 1.75;
const COLUMN_GAP_EM = 1.6;
const MAX_FONT_PX = 30;

/** Picks the column count that gives the largest text with every line on one row. */
export function fitDetails(
  lines: readonly { label: string; value: string }[],
  width: number,
  height: number
): { cols: number; rows: number; fontPx: number } {
  const widestEm = lines.reduce(
    (max, line) =>
      Math.max(
        max,
        (line.label.length + 1) * LABEL_CHAR_EM +
          line.value.length * VALUE_CHAR_EM
      ),
    0
  );
  let best = { cols: 1, rows: lines.length, fontPx: 0 };
  for (let cols = 1; cols <= Math.min(3, lines.length); cols++) {
    const rows = Math.ceil(lines.length / cols);
    const fontPx = Math.min(
      MAX_FONT_PX,
      height / (rows * LINE_EM),
      width / (cols * widestEm + (cols - 1) * COLUMN_GAP_EM)
    );
    // A tie goes to more columns, which reads like the WeatherBug panel.
    if (fontPx >= best.fontPx * 0.98) best = { cols, rows, fontPx };
  }
  return best;
}

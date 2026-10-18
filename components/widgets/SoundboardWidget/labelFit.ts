import { wrapOptions } from '@/components/widgets/UrlWidget/labelFit';

// Average advance of a black-weight glyph, in em; errs wide so wrapped labels never overflow.
const CHAR_EM = 0.66;
const LINE_EM = 1.25;
export const GAP_EM = 0.3;
/** Speaker icon edge as a multiple of the label font size. */
export const ICON_PER_FONT = 2.6;

const round = (n: number) => Math.round(n * 1000) / 1000;

/** CSS font size, in the tile's own container units, that fits the whole label under its icon. */
export function soundLabelFontSize(label: string): string {
  const width = '(100cqw - 10cqmin)';
  const height = '(92cqh - 6cqmin)';
  const fits = wrapOptions(label).map(({ lines, capacity }) => {
    const byWidth = `calc(${width} / ${round(capacity * CHAR_EM)})`;
    const textH = round(lines * LINE_EM + GAP_EM);
    const byHeight = `max(calc((${height} - 40cqmin) / ${textH}), calc(${height} / ${round(textH + ICON_PER_FONT)}))`;
    return `min(${byWidth}, ${byHeight})`;
  });
  return `min(18px, 16cqmin, max(${fits.join(', ')}))`;
}

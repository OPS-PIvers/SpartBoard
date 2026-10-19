import { wrapOptions } from '@/components/widgets/UrlWidget/labelFit';

// Average advance of a bold glyph and the label line height, in em; err wide so names never overflow.
const SEAT_CHAR_EM = 0.62;
const SEAT_LINE_EM = 1.2;

/** Smallest px a seat name may shrink to; below it the name wraps and spills past the seat. */
export const SEAT_LABEL_MIN_PX = 10;

/** Largest px font, from the readable minimum up to `maxPx`, that wraps the name inside a box of this size. */
export function seatLabelFontPx(
  label: string,
  boxW: number,
  boxH: number,
  maxPx: number
): number {
  if (boxW <= 0 || boxH <= 0) return SEAT_LABEL_MIN_PX;
  let best = 0;
  for (const { lines, capacity } of wrapOptions(label)) {
    const fit = Math.min(
      boxW / (capacity * SEAT_CHAR_EM),
      boxH / (lines * SEAT_LINE_EM)
    );
    best = Math.max(best, fit);
  }
  return Math.max(
    SEAT_LABEL_MIN_PX,
    Math.min(maxPx, Math.floor(best * 10) / 10)
  );
}

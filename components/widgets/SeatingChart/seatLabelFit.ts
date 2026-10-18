import { wrapOptions } from '@/components/widgets/UrlWidget/labelFit';

// Average advance of a bold glyph and the label line height, in em; err wide so names never overflow.
const SEAT_CHAR_EM = 0.62;
const SEAT_LINE_EM = 1.2;

/** Largest px font, up to `maxPx`, that wraps the whole name inside a box of this size. */
export function seatLabelFontPx(
  label: string,
  boxW: number,
  boxH: number,
  maxPx: number
): number {
  if (boxW <= 0 || boxH <= 0) return 1;
  let best = 0;
  for (const { lines, capacity } of wrapOptions(label)) {
    const fit = Math.min(
      boxW / (capacity * SEAT_CHAR_EM),
      boxH / (lines * SEAT_LINE_EM)
    );
    best = Math.max(best, fit);
  }
  return Math.max(1, Math.min(maxPx, Math.floor(best * 10) / 10));
}

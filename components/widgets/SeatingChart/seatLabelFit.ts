import { wrapOptions } from '@/components/widgets/UrlWidget/labelFit';

// Average advance of a bold glyph and the label line height, in em; err wide so names never overflow.
const SEAT_CHAR_EM = 0.62;
const SEAT_LINE_EM = 1.2;

/** Smallest px a seat name may shrink to; a name that still doesn't fit is truncated. */
export const SEAT_LABEL_MIN_PX = 10;

/** Largest px font, from the readable minimum up to `maxPx`, that wraps the name inside a box of this size. */
export function seatLabelFontPx(
  label: string,
  boxW: number,
  boxH: number,
  maxPx: number
): number {
  return seatLabelFit(label, boxW, boxH, maxPx).px;
}

/** Font size plus whether the whole name fits at that size. */
export function seatLabelFit(
  label: string,
  boxW: number,
  boxH: number,
  maxPx: number
): { px: number; fits: boolean } {
  if (boxW <= 0 || boxH <= 0) return { px: SEAT_LABEL_MIN_PX, fits: false };
  let best = 0;
  for (const { lines, capacity } of wrapOptions(label)) {
    const fit = Math.min(
      boxW / (capacity * SEAT_CHAR_EM),
      boxH / (lines * SEAT_LINE_EM)
    );
    best = Math.max(best, fit);
  }
  const px = Math.min(maxPx, Math.floor(best * 10) / 10);
  return { px: Math.max(SEAT_LABEL_MIN_PX, px), fits: px >= SEAT_LABEL_MIN_PX };
}

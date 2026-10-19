import { describe, expect, it } from 'vitest';
import { SEAT_LABEL_MIN_PX, seatLabelFontPx } from './seatLabelFit';

describe('seatLabelFontPx', () => {
  it('keeps a short name at the usual size', () => {
    expect(seatLabelFontPx('Kai Patel', 68, 50, 12)).toBe(12);
  });

  it('shrinks a long name until every line fits the seat', () => {
    const label = 'Maximiliana-Josephine Vanderbilt-Oyelaran-Castellanos';
    const px = seatLabelFontPx(label, 68, 50, 12);
    expect(px).toBeLessThan(12);
    expect(px).toBeGreaterThanOrEqual(SEAT_LABEL_MIN_PX);
  });

  it('holds the readable minimum on very small furniture', () => {
    expect(seatLabelFontPx('Malik Kowalski', 18, 20, 12)).toBe(
      SEAT_LABEL_MIN_PX
    );
  });

  it('never returns zero for an empty box', () => {
    expect(seatLabelFontPx('Ava', 0, 0, 12)).toBe(SEAT_LABEL_MIN_PX);
  });
});

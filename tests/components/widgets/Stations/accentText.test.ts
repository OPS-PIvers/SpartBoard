import { describe, it, expect } from 'vitest';
import { getAccessibleAccentText } from '@/components/widgets/Stations/components/accentText';

const luminance = (hex: string): number => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const body = m[1];
  const channel = (start: number): number => {
    const v = parseInt(body.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
};

const contrastVsWhite = (hex: string): number => {
  const l = luminance(hex);
  return (1 + 0.05) / (l + 0.05);
};

describe('getAccessibleAccentText', () => {
  it('returns a result with WCAG AA contrast (>= 4.5) over white for light accents', () => {
    const lightAccents = [
      '#fbbf24', // yellow / amber
      '#facc15', // yellow-400
      '#a3e635', // lime-400
      '#22c55e', // emerald-500 (borderline)
      '#06b6d4', // cyan-500
    ];
    for (const accent of lightAccents) {
      const result = getAccessibleAccentText(accent);
      expect(contrastVsWhite(result)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('preserves the original color when it is already dark enough', () => {
    const darkAccents = [
      '#1e293b', // slate-800
      '#7f1d1d', // red-900
      '#1e3a8a', // blue-900
    ];
    for (const accent of darkAccents) {
      expect(getAccessibleAccentText(accent)).toBe(accent);
    }
  });

  it('returns input unchanged for malformed values', () => {
    expect(getAccessibleAccentText('not-a-color')).toBe('not-a-color');
    expect(getAccessibleAccentText('')).toBe('');
  });

  /**
   * Regression test: getAccessibleAccentText must start stepping from the
   * ORIGINAL lightness, not a hard-coded 0.5.
   *
   * Bug (fixed)
   * -----------
   * The original code destructured only [h, s] from rgbToHsl, discarding
   * the lightness, then initialised `let l = 0.5` before the stepping loop.
   * For colors whose accessible lightness lies ABOVE 0.5 — blue-violets,
   * purples, desaturated reds — the loop would miss the lightest passing
   * value and return a needlessly dark result.
   *
   * Concrete case: #6675ff (blue-violet, l≈0.70, contrast 3.77 vs white).
   *   • Buggy code starts at l=0.5 → first passing value is l=0.50 (#0019ff,
   *     contrast 8.1) — far darker than the accessible threshold requires.
   *   • Fixed code starts at l=0.70 → first passing value is l=0.66 (#5263ff,
   *     contrast 4.58) — the lightest accessible version of that color.
   *
   * The test proves the fix by asserting that the returned color is not darker
   * than l=0.50 when a lighter accessible version exists above that threshold.
   * This assertion FAILS on the buggy code and PASSES after the fix.
   */
  it('returns the lightest accessible variant, not an unnecessarily dark one', () => {
    // #6675ff: blue-violet whose HSL lightness is ~0.70. It fails contrast
    // (3.77:1 vs white), but the first accessible value while stepping DOWN
    // from l=0.70 is at l≈0.66 (#5263ff, contrast 4.58:1). The buggy code
    // started from l=0.50 and returned l=0.50 (#0019ff, contrast 8.11:1)
    // — over-darkened by roughly 4 stops of lightness.
    const result = getAccessibleAccentText('#6675ff');

    // The result must still pass WCAG AA contrast.
    expect(contrastVsWhite(result)).toBeGreaterThanOrEqual(4.5);

    // The result's contrast must NOT be drastically higher than the minimum
    // threshold: a contrast ≥ 6.0 here means the code over-darkened the color
    // (the buggy code returned contrast ≈ 8.1). 5.5 gives headroom for
    // floating-point differences while ruling out the over-darkened result.
    expect(contrastVsWhite(result)).toBeLessThan(5.5);
  });
});

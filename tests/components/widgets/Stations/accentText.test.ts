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
});

import { describe, it, expect } from 'vitest';
import { getClassColor, CLASS_COLOR_PALETTE } from '@/utils/studentClassColors';

describe('studentClassColors', () => {
  describe('getClassColor', () => {
    it('returns a palette entry for any non-empty classId', () => {
      const color = getClassColor('classlink-12345');
      expect(CLASS_COLOR_PALETTE).toContainEqual(color);
    });

    it('is deterministic — same classId always returns the same color', () => {
      const a = getClassColor('classlink-abc-period-3');
      const b = getClassColor('classlink-abc-period-3');
      expect(a).toEqual(b);
    });

    it('returns the first palette entry for empty input', () => {
      expect(getClassColor('')).toEqual(CLASS_COLOR_PALETTE[0]);
    });

    it('spreads many distinct classIds across at least half the palette', () => {
      // Synthetic but realistic-looking sourcedIds. The hash should land
      // somewhere in the palette for each, and across enough inputs we
      // should see meaningful spread (not collapse to one or two buckets).
      const ids = Array.from(
        { length: 200 },
        (_, i) => `roster-${i}-period-${i % 7}`
      );
      const seen = new Set(ids.map((id) => getClassColor(id).bar));
      expect(seen.size).toBeGreaterThanOrEqual(
        Math.ceil(CLASS_COLOR_PALETTE.length / 2)
      );
    });

    it('every palette entry has the brand-aligned shape', () => {
      for (const entry of CLASS_COLOR_PALETTE) {
        expect(entry.bar).toMatch(/^#[0-9A-F]{6}$/i);
        expect(entry.soft).toMatch(/^#[0-9A-F]{6}$/i);
        expect(entry.ink).toMatch(/^#[0-9A-F]{6}$/i);
      }
    });
  });
});

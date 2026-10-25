import { describe, it, expect } from 'vitest';
import type { TextObject } from '@/types';
import { applyTextWrapOnResize, fitStickyFontSize, STICKY_SIZE } from './text';

const note = (
  content: string,
  w = STICKY_SIZE,
  h = STICKY_SIZE
): TextObject => ({
  id: 's',
  kind: 'text',
  z: 0,
  x: 0,
  y: 0,
  w,
  h,
  content,
  fontFamily: 'Lexend, sans-serif',
  fontSize: 24,
  color: '#1e293b',
  wrap: true,
  sticky: { fill: '#eab308' },
});

describe('sticky notes', () => {
  it('keeps the full font size for short text', () => {
    expect(fitStickyFontSize(note('Hi'))).toBe(24);
  });

  it('shrinks the font so long text fits inside the note', () => {
    const long = 'word '.repeat(80).trim();
    const size = fitStickyFontSize(note(long));
    expect(size).toBeLessThan(24);
    expect(size).toBeGreaterThanOrEqual(10);
    expect(fitStickyFontSize(note(long, 360, 360))).toBeGreaterThan(size);
  });

  it('keeps the dragged size when resized', () => {
    const before = note('Hi');
    const after = { ...before, w: 300, h: 120 };
    expect(applyTextWrapOnResize(after, before)).toEqual(after);
  });
});

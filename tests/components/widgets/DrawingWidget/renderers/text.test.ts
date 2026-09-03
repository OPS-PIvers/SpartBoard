import { describe, it, expect } from 'vitest';
import {
  layoutTextLines,
  measureTextObject,
  applyTextWrapOnResize,
  TEXT_PAD_X,
} from '@/components/widgets/DrawingWidget/renderers/text';
import type { TextObject, RectObject } from '@/types';

const text = (overrides: Partial<TextObject> = {}): TextObject => ({
  id: 't',
  kind: 'text',
  z: 0,
  x: 0,
  y: 0,
  w: 200,
  h: 48,
  content: 'one two three four',
  fontFamily: 'sans-serif',
  fontSize: 10,
  color: '#000',
  ...overrides,
});

// jsdom has no canvas 2D context, so widths fall back to len * fontSize * 0.55.
describe('renderers/text layout', () => {
  it('splits only on hard breaks when wrap is unset', () => {
    expect(layoutTextLines(null, text({ content: 'a b\nc d' }))).toEqual([
      'a b',
      'c d',
    ]);
  });

  it('word-wraps to the object width when wrap is set', () => {
    // 'one two' = 7 chars * 5.5 = 38.5 fits in 40 + pad; 'one two three' does not.
    const lines = layoutTextLines(
      null,
      text({ wrap: true, w: 40 + TEXT_PAD_X * 2 })
    );
    expect(lines).toEqual(['one two', 'three', 'four']);
  });

  it('never drops a word longer than the width', () => {
    const lines = layoutTextLines(
      null,
      text({
        wrap: true,
        w: TEXT_PAD_X * 2 + 1,
        content: 'supercalifragilistic x',
      })
    );
    expect(lines).toEqual(['supercalifragilistic', 'x']);
  });

  it('measures height from the wrapped line count', () => {
    const { h } = measureTextObject(
      text({ wrap: true, w: 40 + TEXT_PAD_X * 2 })
    );
    expect(h).toBe(Math.ceil(3 * 10 * 1.2));
  });

  it('applyTextWrapOnResize flips wrap on a width change and refits height', () => {
    const before = text();
    const after = { ...before, w: 40 + TEXT_PAD_X * 2, h: 999 };
    const result = applyTextWrapOnResize(after, before) as TextObject;
    expect(result.wrap).toBe(true);
    expect(result.h).toBe(Math.ceil(3 * 10 * 1.2));
  });

  it('applyTextWrapOnResize leaves moves, rotations and non-text objects alone', () => {
    const before = text();
    const moved = { ...before, x: 50, rotation: 1 };
    expect(applyTextWrapOnResize(moved, before)).toBe(moved);
    const rect: RectObject = {
      id: 'r',
      kind: 'rect',
      z: 0,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      stroke: '#000',
      strokeWidth: 1,
    };
    const resized = { ...rect, w: 20 };
    expect(applyTextWrapOnResize(resized, rect)).toBe(resized);
  });
});

import { describe, expect, it } from 'vitest';
import { linkLabelFontSize, wrapLineCount, wrapOptions } from './labelFit';

describe('UrlWidget label fitting', () => {
  it('wraps at word boundaries', () => {
    expect(wrapLineCount(['Google', 'Classroom'], 16)).toBe(1);
    expect(wrapLineCount(['Google', 'Classroom'], 15)).toBe(2);
    expect(wrapLineCount(['Google', 'Classroom'], 9)).toBe(2);
  });

  it('breaks a word longer than the line', () => {
    expect(wrapLineCount(['abcdefghij'], 4)).toBe(3);
    expect(wrapLineCount(['ab', 'abcdefghij'], 4)).toBe(4);
    expect(wrapLineCount(['abcdefghij', 'x'], 5)).toBe(3);
  });

  it('lists the narrowest line for each line count', () => {
    expect(wrapOptions('Google Classroom').slice(0, 3)).toEqual([
      { lines: 1, capacity: 16 },
      { lines: 2, capacity: 9 },
      { lines: 3, capacity: 6 },
    ]);
    const label =
      'Item 1: Pneumonoultramicroscopicsilicovolcanoconiosis and a long label';
    const words = label.split(' ');
    for (const { lines, capacity } of wrapOptions(label)) {
      expect(wrapLineCount(words, capacity)).toBeLessThanOrEqual(lines);
      if (capacity > 1)
        expect(wrapLineCount(words, capacity - 1)).toBeGreaterThan(lines);
    }
  });

  it('never exceeds the usual tile font size', () => {
    const css = linkLabelFontSize('Desmos', { withIcon: true, circle: false });
    expect(css.startsWith('min(clamp(11px, 9cqmin, 28px), max(')).toBe(true);
    expect(linkLabelFontSize('', { withIcon: false, circle: true })).toContain(
      'max(min('
    );
  });
});

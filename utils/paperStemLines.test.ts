import { describe, expect, it } from 'vitest';
import { QUESTION_STEM_W_MM } from './paperSheetLayout';
import {
  browserStemMeasure,
  stemLineCount,
  stemLinesById,
} from './paperStemLines';

// Monospace stub: 2 mm per character, so a line holds about 67 characters.
const mono = (text: string): number => text.length * 2;
const perLine = Math.floor((QUESTION_STEM_W_MM * 0.94) / 2);

describe('stemLineCount', () => {
  it('counts one line for a short or empty stem', () => {
    expect(stemLineCount('A bird that has eaten an insect', mono)).toBe(1);
    expect(stemLineCount('   ', mono)).toBe(1);
  });

  it('wraps on words the way the stem box does', () => {
    const word = 'x'.repeat(9);
    const words = (n: number) =>
      Array.from({ length: n }, () => word).join(' ');
    // Ten-character slots: six words fit a line, the seventh wraps.
    expect(perLine).toBeGreaterThanOrEqual(59);
    expect(perLine).toBeLessThan(69);
    expect(stemLineCount(words(6), mono)).toBe(1);
    expect(stemLineCount(words(7), mono)).toBe(2);
  });

  it('caps at the three lines the box shows', () => {
    expect(stemLineCount('word '.repeat(400), mono)).toBe(3);
  });
});

describe('stemLinesById', () => {
  it('leaves stems unmeasured without a measurer', () => {
    expect(stemLinesById([{ id: 'q1', text: 'Hi' }], null)).toBeUndefined();
    // jsdom's canvas has no measureText.
    expect(browserStemMeasure()).toBeNull();
  });

  it('measures every question by id', () => {
    expect(
      stemLinesById(
        [
          { id: 'q1', text: 'Short' },
          { id: 'q2', text: 'word '.repeat(400) },
        ],
        mono
      )
    ).toEqual({ q1: 1, q2: 3 });
  });
});

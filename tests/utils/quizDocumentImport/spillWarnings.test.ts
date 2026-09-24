import { describe, expect, it } from 'vitest';
import {
  spillMessage,
  spillWarnings,
} from '@/utils/quizDocumentImport/spillWarnings';

describe('spillWarnings (R18)', () => {
  it('passes a clean question', () => {
    expect(
      spillWarnings('What is 2 + 2?', ['3', '4', '5', 'Vitamin A. is a thing'])
    ).toEqual([]);
  });

  it('flags a merged grid choice as another choice', () => {
    expect(
      spillWarnings('Convert 3.574 km to m.', [
        '357.4 d. 35,740',
        '3,574',
        '35.74',
      ])
    ).toEqual([{ at: 0, kind: 'choice' }]);
  });

  it('flags a key entry appended to the last option', () => {
    const w = spillWarnings('Pick one.', ['Red', 'Blue', 'Green 1. B 2. C']);
    expect(w).toEqual([{ at: 2, kind: 'key' }]);
    expect(spillMessage(w[0])).toBe('This choice may contain answer-key text');
  });

  it('does not treat a numbered sentence as a key entry', () => {
    expect(spillWarnings('Q', ['1. A mixture of salt', 'b', 'c'])).toEqual([]);
  });

  it('flags a choice over 200 characters or 3× the median', () => {
    const long = 'x'.repeat(201);
    expect(spillWarnings('Q', ['a', long])).toEqual([
      { at: 1, kind: 'choice' },
    ]);
    const heading = 'Mitosis Graphing Problem-5 points Section Two Directions';
    expect(
      spillWarnings('Q', ['Mitosis', 'Meiosis', 'Binary fission', heading])
    ).toEqual([{ at: 3, kind: 'choice' }]);
  });

  it('ignores the ratio for short choices', () => {
    expect(spillWarnings('Q', ['No', 'Yes', 'Not sure yet'])).toEqual([]);
  });

  it('flags a stem holding the choices or key text', () => {
    expect(spillWarnings('Pick one a. red b. blue', [])).toEqual([
      { at: 'stem', kind: 'choice' },
    ]);
    expect(spillWarnings('Explain. 21. B', [])).toEqual([
      { at: 'stem', kind: 'key' },
    ]);
    expect(spillWarnings('In part (a) explain why.', [])).toEqual([]);
  });
});

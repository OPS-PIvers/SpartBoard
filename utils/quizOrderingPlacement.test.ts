import { describe, it, expect } from 'vitest';
import { ordinal, placeOrderingAnswer } from '@/utils/quizOrderingPlacement';

const marks = (correct: string, given: string) =>
  placeOrderingAnswer(correct.split('|'), given.split('|')).spots.map(
    (s) => `${s.text}${s.inOrder ? '' : '!'}`
  );

describe('placeOrderingAnswer', () => {
  it('marks nothing on a correct answer', () => {
    expect(marks('a|b|c', 'A|b|c')).toEqual(['A', 'b', 'c']);
  });

  it('marks only the one item moved from first to last', () => {
    expect(marks('a|b|c|d|e', 'b|c|d|e|a')).toEqual(['b', 'c', 'd', 'e', 'a!']);
  });

  it('marks one item of a swap, so the marks match partial credit', () => {
    expect(
      marks('a|b|c|d', 'b|a|c|d').filter((m) => m.endsWith('!'))
    ).toHaveLength(1);
  });

  it('prefers keeping items that sit in their exact spot', () => {
    expect(marks('a|b|c|d', 'c|b|a|d')).toEqual(['c!', 'b', 'a!', 'd']);
  });

  it('keeps one item of a reversed list, matching its partial credit', () => {
    expect(marks('a|b|c', 'c|b|a')).toEqual(['c!', 'b', 'a!']);
  });

  it('treats empty slots and unknown items as out of order and reports left-out key items', () => {
    const p = placeOrderingAnswer(['a', 'b', 'c'], ['a', '', 'zz']);
    expect(p.spots.map((s) => [s.correctIndex, s.inOrder])).toEqual([
      [0, true],
      [-1, false],
      [-1, false],
    ]);
    expect(p.placedAt).toEqual([0, null, null]);
    expect(p.misplaced).toEqual([false, true, true]);
  });

  it('pairs duplicate items left to right, like the grader', () => {
    expect(marks('a|b|a', 'a|b|a')).toEqual(['a', 'b', 'a']);
  });
});

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [21, '21st'],
    [22, '22nd'],
  ])('%i → %s', (n, out) => expect(ordinal(n)).toBe(out));
});

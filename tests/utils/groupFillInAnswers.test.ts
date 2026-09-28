import { describe, it, expect } from 'vitest';
import { groupFillInAnswers } from '@/utils/groupFillInAnswers';

const question = {
  correctAnswer: 'Mitochondria',
  acceptableVariants: ['mitochondrion'],
};

describe('groupFillInAnswers', () => {
  it('folds case, spacing, accents and accepted variants into one correct group', () => {
    const result = groupFillInAnswers(
      [
        'mitochondria',
        ' MITOCHONDRIA ',
        'Mitochondrion',
        'nucleus',
        'Nucleus',
        'ribosome',
      ],
      question
    );
    expect(result.totalAnswered).toBe(6);
    expect(result.groups[0]).toEqual({
      label: 'Mitochondria',
      count: 3,
      isCorrect: true,
    });
    expect(result.groups[1]).toEqual({
      label: 'nucleus',
      count: 2,
      isCorrect: false,
    });
    expect(result.groups[2]).toEqual({
      label: 'ribosome',
      count: 1,
      isCorrect: false,
    });
    expect(result.otherCount).toBe(0);
  });

  it('puts answers past the top N in an Other bucket', () => {
    const result = groupFillInAnswers(['a', 'a', 'b', 'c', 'd'], question, 2);
    expect(result.groups.map((g) => g.label)).toEqual(['a', 'b']);
    expect(result.otherCount).toBe(2);
    expect(result.totalAnswered).toBe(5);
  });

  it('ignores blank answers and labels a group by its most common spelling', () => {
    const result = groupFillInAnswers(
      ['', '   ', 'Café', 'cafe', 'Café'],
      question
    );
    expect(result.totalAnswered).toBe(3);
    expect(result.groups).toEqual([
      { label: 'Café', count: 3, isCorrect: false },
    ]);
  });

  it('never marks anything correct when the key is empty', () => {
    const result = groupFillInAnswers(['x', ''], { correctAnswer: '' });
    expect(result.groups).toEqual([{ label: 'x', count: 1, isCorrect: false }]);
  });
});

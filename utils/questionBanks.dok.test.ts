import { describe, expect, it } from 'vitest';
import type { QuizQuestion } from '@/types';
import { eligibleBankQuestions } from '@/utils/questionBanks';

const q = (id: string, dok?: 1 | 2 | 3 | 4, tagId?: string): QuizQuestion => ({
  id,
  type: 'MC',
  text: id,
  timeLimit: 30,
  correctAnswer: 'A',
  incorrectAnswers: ['B'],
  ...(dok ? { dok } : {}),
  ...(tagId
    ? { targets: [{ id: tagId, kind: 'personal' as const, label: tagId }] }
    : {}),
});

const bank = {
  questions: [
    q('a', 1, 't1'),
    q('b', 3, 't1'),
    q('c', 3, 't2'),
    q('d', undefined, 't1'),
    q('e', 4),
  ],
};

const ids = (list: QuizQuestion[]) => list.map((x) => x.id);

describe('eligibleBankQuestions with a DOK filter', () => {
  it('returns every question when no DOK filter is set', () => {
    expect(ids(eligibleBankQuestions(bank))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids(eligibleBankQuestions(bank, [], undefined, []))).toHaveLength(5);
  });

  it('keeps only questions at the chosen level and drops unlevelled ones', () => {
    expect(ids(eligibleBankQuestions(bank, undefined, undefined, [3]))).toEqual(
      ['b', 'c']
    );
  });

  it('accepts several levels', () => {
    expect(
      ids(eligibleBankQuestions(bank, undefined, undefined, [1, 4]))
    ).toEqual(['a', 'e']);
  });

  it('combines with a target filter as both must match', () => {
    expect(ids(eligibleBankQuestions(bank, ['t1'], undefined, [3]))).toEqual([
      'b',
    ]);
  });

  it('applies inside a pool restriction', () => {
    expect(
      ids(eligibleBankQuestions(bank, undefined, ['a', 'b', 'd'], [3]))
    ).toEqual(['b']);
  });
});

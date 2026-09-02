import { describe, it, expect } from 'vitest';
import {
  countCommittedTakes,
  nextTakeIndex,
  selectRepresentativeAnswers,
} from './answerTakeOrdering';

const artifact = { id: 'a', slot: 'primary', kind: 'audio' };

describe('selectRepresentativeAnswers with takes', () => {
  it('is a no-op for the one-entry-per-question arrays every legacy quiz has', () => {
    const answers = [
      { questionId: 'q1', answeredAt: 10 },
      { questionId: 'q2', answeredAt: 20 },
    ];
    const picked = selectRepresentativeAnswers(answers);
    expect(picked.get('q1')).toBe(answers[0]);
    expect(picked.get('q2')).toBe(answers[1]);
  });

  it('prefers the higher takeIndex, and the earliest answeredAt within a tie', () => {
    const raceEarly = { questionId: 'q1', answeredAt: 10, takeIndex: 2 };
    const raceLate = { questionId: 'q1', answeredAt: 40, takeIndex: 2 };
    const older = { questionId: 'q1', answeredAt: 99, takeIndex: 1 };
    const picked = selectRepresentativeAnswers([raceLate, older, raceEarly]);
    expect(picked.get('q1')).toBe(raceEarly);
  });
});

describe('nextTakeIndex / countCommittedTakes', () => {
  it('starts at 1 and increments past the highest existing take', () => {
    expect(nextTakeIndex([], 'q1')).toBe(1);
    expect(
      nextTakeIndex(
        [
          { questionId: 'q1', takeIndex: 1 },
          { questionId: 'q1', takeIndex: 3 },
          { questionId: 'q2', takeIndex: 9 },
        ],
        'q1'
      )
    ).toBe(4);
  });

  it('counts only artifact-bearing, responded entries', () => {
    const answers: {
      questionId: string;
      unresponded?: string;
      artifacts?: { uploadState?: string }[];
    }[] = [
      { questionId: 'q1', artifacts: [artifact] },
      { questionId: 'q1', artifacts: [artifact] },
      { questionId: 'q1', artifacts: [], unresponded: undefined },
      { questionId: 'q1', unresponded: 'expired', artifacts: [artifact] },
      { questionId: 'q2', artifacts: [artifact] },
    ];
    expect(countCommittedTakes(answers, 'q1')).toBe(2);
  });

  it('counts zero on a legacy answers array with no artifacts at all', () => {
    expect(countCommittedTakes([{ questionId: 'q1' }], 'q1')).toBe(0);
  });
});

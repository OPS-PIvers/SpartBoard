import { describe, it, expect } from 'vitest';
import {
  isQuestionAnswered,
  countAnsweredQuestions,
  type CompletenessAnswer,
} from './quizCompleteness';

describe('isQuestionAnswered', () => {
  it('counts an entry with no unresponded field as answered', () => {
    const answers: CompletenessAnswer[] = [{ questionId: 'q1' }];
    expect(isQuestionAnswered(answers, 'q1')).toBe(true);
  });

  it('does not count an entry marked unresponded, for any reason', () => {
    for (const reason of [
      'passed',
      'expired',
      'abandoned',
      'capture-unavailable',
    ] as const) {
      expect(
        isQuestionAnswered([{ questionId: 'q1', unresponded: reason }], 'q1')
      ).toBe(false);
    }
  });

  it('does not count a question with no entry at all', () => {
    expect(isQuestionAnswered([{ questionId: 'q1' }], 'q2')).toBe(false);
  });

  it('counts the question when any take is a real response', () => {
    const answers: CompletenessAnswer[] = [
      { questionId: 'q1', unresponded: 'passed' },
      { questionId: 'q1' },
    ];
    expect(isQuestionAnswered(answers, 'q1')).toBe(true);
  });
});

describe('countAnsweredQuestions', () => {
  // Legacy shape: every production document written before this field
  // existed has no `unresponded` key anywhere, so presence must still mean
  // answered and absence must still mean unanswered.
  it('behaves exactly like presence-counting on legacy-shape answers', () => {
    const answers: CompletenessAnswer[] = [
      { questionId: 'q1' },
      { questionId: 'q3' },
    ];
    expect(countAnsweredQuestions(answers, ['q1', 'q2', 'q3'])).toBe(2);
  });

  it('excludes unresponded entries from the count', () => {
    const answers: CompletenessAnswer[] = [
      { questionId: 'q1' },
      { questionId: 'q2', unresponded: 'abandoned' },
      { questionId: 'q3', unresponded: 'passed' },
    ];
    expect(countAnsweredQuestions(answers, ['q1', 'q2', 'q3'])).toBe(1);
  });

  it('counts a duplicated question id once', () => {
    const answers: CompletenessAnswer[] = [
      { questionId: 'q1' },
      { questionId: 'q1' },
    ];
    expect(countAnsweredQuestions(answers, ['q1'])).toBe(1);
  });

  it('returns 0 for an empty answers array', () => {
    expect(countAnsweredQuestions([], ['q1', 'q2'])).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  isQuestionAnswered,
  isQuestionOpen,
  countAnsweredQuestions,
  countOpenQuestions,
  listOpenQuestions,
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

describe('recording takes', () => {
  const failedTake: CompletenessAnswer = {
    questionId: 'q1',
    artifacts: [
      {
        id: 'a1',
        slot: 'primary',
        kind: 'audio',
        uploadState: 'failed',
      },
    ],
  };
  const sentTake: CompletenessAnswer = {
    questionId: 'q1',
    artifacts: [
      {
        id: 'a2',
        slot: 'primary',
        kind: 'audio',
        uploadState: 'uploaded',
      },
    ],
  };

  it('does not count a take whose only artifact failed to upload', () => {
    expect(isQuestionAnswered([failedTake], 'q1')).toBe(false);
  });

  it('counts a take whose artifact reached the teacher', () => {
    expect(isQuestionAnswered([sentTake], 'q1')).toBe(true);
  });

  it('leaves a failed-only recording question open to record again', () => {
    expect(isQuestionOpen([failedTake], 'q1')).toBe(true);
  });

  it('treats an empty artifacts array as nothing committed', () => {
    const emptyTake: CompletenessAnswer = { questionId: 'q1', artifacts: [] };
    expect(isQuestionAnswered([emptyTake], 'q1')).toBe(false);
    expect(isQuestionOpen([emptyTake], 'q1')).toBe(true);
  });

  it('still counts a legacy answer that carries no artifacts key', () => {
    expect(isQuestionAnswered([{ questionId: 'q1' }], 'q1')).toBe(true);
  });
});

describe('isQuestionOpen', () => {
  it('is open when nothing has been written for the question', () => {
    expect(isQuestionOpen([], 'q1')).toBe(true);
  });

  it('is closed once the question is answered', () => {
    expect(isQuestionOpen([{ questionId: 'q1' }], 'q1')).toBe(false);
  });

  it('is closed for every unresponded reason — those are resolved, not open', () => {
    for (const reason of [
      'passed',
      'expired',
      'abandoned',
      'capture-unavailable',
    ] as const) {
      expect(
        isQuestionOpen([{ questionId: 'q1', unresponded: reason }], 'q1')
      ).toBe(false);
    }
  });
});

describe('countOpenQuestions', () => {
  it('counts only the questions the student can still fill', () => {
    const answers: CompletenessAnswer[] = [
      { questionId: 'q1' },
      { questionId: 'q2', unresponded: 'capture-unavailable' },
    ];
    expect(countOpenQuestions(answers, ['q1', 'q2', 'q3', 'q4'])).toBe(2);
  });

  it('lists the open ids in the order asked', () => {
    const answers: CompletenessAnswer[] = [
      { questionId: 'q1' },
      { questionId: 'q2', unresponded: 'capture-unavailable' },
    ];
    expect(listOpenQuestions(answers, ['q1', 'q2', 'q3', 'q4'])).toEqual([
      'q3',
      'q4',
    ]);
  });
});

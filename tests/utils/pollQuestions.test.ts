import { describe, it, expect } from 'vitest';
import type { PollConfig } from '@/types';
import {
  MAX_POLL_QUESTIONS,
  clampQuestionIndex,
  getCurrentQuestion,
  getPollQuestions,
  makeEmptyPollQuestion,
  withPollQuestions,
  withQuestionAt,
} from '@/utils/pollQuestions';

const legacy: PollConfig = {
  question: 'Favorite color?',
  options: [
    { id: 'o1', label: 'Red', votes: 2 },
    { id: 'o2', label: 'Blue', votes: 1 },
  ],
};

const multi: PollConfig = {
  questions: [
    { id: 'q1', question: 'A?', options: [{ id: 'o1', label: 'X', votes: 0 }] },
    { id: 'q2', question: 'B?', options: [{ id: 'o2', label: 'Y', votes: 0 }] },
  ],
  currentQuestionIndex: 1,
};

describe('getPollQuestions', () => {
  it('wraps a legacy single-question config', () => {
    expect(getPollQuestions(legacy)).toEqual([
      { id: 'q-1', question: 'Favorite color?', options: legacy.options },
    ]);
  });

  it('preserves an empty legacy question rather than substituting a default', () => {
    expect(getPollQuestions({ question: '', options: [] })[0].question).toBe(
      ''
    );
  });

  it('falls back to the board default when no question was ever set', () => {
    expect(getPollQuestions({})[0].question).toBe('Vote Now!');
  });

  it('prefers the canonical array when present', () => {
    expect(getPollQuestions(multi)).toHaveLength(2);
  });

  it('ignores an empty questions array', () => {
    expect(getPollQuestions({ ...legacy, questions: [] })).toHaveLength(1);
  });
});

describe('clampQuestionIndex', () => {
  it('clamps into range and defaults out-of-band values to 0', () => {
    expect(clampQuestionIndex(1, 3)).toBe(1);
    expect(clampQuestionIndex(9, 3)).toBe(2);
    expect(clampQuestionIndex(-4, 3)).toBe(0);
    expect(clampQuestionIndex(undefined, 3)).toBe(0);
    expect(clampQuestionIndex(1.5, 3)).toBe(0);
    expect(clampQuestionIndex(2, 0)).toBe(0);
  });
});

describe('getCurrentQuestion', () => {
  it('follows the presentation cursor', () => {
    expect(getCurrentQuestion(multi).id).toBe('q2');
  });

  it('falls back to the first question when the cursor is stale', () => {
    expect(getCurrentQuestion({ ...multi, currentQuestionIndex: 7 }).id).toBe(
      'q2'
    );
  });
});

describe('withPollQuestions', () => {
  it('drops the legacy mirror so the two shapes cannot drift', () => {
    const next = withPollQuestions(legacy, [
      { id: 'q1', question: 'New?', options: [] },
    ]);
    expect(next.questions).toHaveLength(1);
    expect('question' in next).toBe(false);
    expect('options' in next).toBe(false);
  });

  it('clamps the cursor when the question list shrinks', () => {
    const next = withPollQuestions(multi, [getPollQuestions(multi)[0]]);
    expect(next.currentQuestionIndex).toBe(0);
  });

  it('preserves unrelated config keys', () => {
    const next = withPollQuestions({ ...legacy, joinCode: 'K3F9Q' }, []);
    expect(next.joinCode).toBe('K3F9Q');
  });
});

describe('withQuestionAt', () => {
  it('replaces only the targeted question', () => {
    const next = withQuestionAt(multi, 1, {
      id: 'q2',
      question: 'Changed?',
      options: [],
    });
    expect(next.questions?.[0].question).toBe('A?');
    expect(next.questions?.[1].question).toBe('Changed?');
  });

  it('upgrades a legacy config in place', () => {
    const next = withQuestionAt(legacy, 0, {
      id: 'q-1',
      question: 'Favorite color?',
      options: [{ id: 'o1', label: 'Red', votes: 3 }],
    });
    expect(next.questions?.[0].options[0].votes).toBe(3);
    expect('options' in next).toBe(false);
  });
});

describe('makeEmptyPollQuestion', () => {
  it('mints unique ids for the question and its starter options', () => {
    const a = makeEmptyPollQuestion();
    const b = makeEmptyPollQuestion();
    expect(a.id).not.toBe(b.id);
    expect(a.options).toHaveLength(2);
    expect(a.options[0].id).not.toBe(a.options[1].id);
  });
});

describe('MAX_POLL_QUESTIONS', () => {
  it('caps a poll at twenty questions', () => {
    expect(MAX_POLL_QUESTIONS).toBe(20);
  });
});

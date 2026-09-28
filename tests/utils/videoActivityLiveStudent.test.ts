import { describe, expect, it } from 'vitest';
import {
  isQuestionClosedError,
  liveStudentScreen,
} from '@/utils/videoActivityLiveStudent';
import type {
  VideoActivityLiveState,
  VideoActivityPublicQuestion,
} from '@/types';

const q1 = {
  id: 'q1',
  timestamp: 1,
  text: 'A?',
  type: 'MC',
  options: ['a', 'b'],
} as VideoActivityPublicQuestion;

const live = (over: Partial<VideoActivityLiveState> = {}) => ({
  currentQuestionId: 'q1',
  questionPhase: 'open' as const,
  resultsShown: false,
  answerRevealed: false,
  askedQuestionIds: ['q1'],
  skippedQuestionIds: [],
  playheadSeconds: 0,
  updatedAt: 1,
  ...over,
});

const answer = { questionId: 'q1', answer: 'a', answeredAt: 1 };

describe('isQuestionClosedError', () => {
  it('matches the typed callable refusal', () => {
    expect(
      isQuestionClosedError({
        code: 'functions/failed-precondition',
        details: { reason: 'question-closed' },
      })
    ).toBe(true);
  });

  it('ignores other failed-precondition refusals', () => {
    expect(
      isQuestionClosedError({ code: 'functions/failed-precondition' })
    ).toBe(false);
    expect(isQuestionClosedError(new Error('x'))).toBe(false);
    expect(isQuestionClosedError(null)).toBe(false);
  });
});

describe('liveStudentScreen', () => {
  const screenFor = (
    over: Partial<VideoActivityLiveState>,
    answers = [] as (typeof answer)[],
    status: 'waiting' | 'active' | 'ended' = 'active',
    closed: string | null = null
  ) =>
    liveStudentScreen({ status, live: live(over) }, [q1], answers, closed).kind;

  it('follows the session state table', () => {
    expect(screenFor({}, [], 'waiting')).toBe('waiting');
    expect(screenFor({}, [], 'ended')).toBe('ended');
    expect(screenFor({ currentQuestionId: null })).toBe('watch');
    expect(screenFor({ currentQuestionId: 'gone' })).toBe('watch');
    expect(screenFor({})).toBe('question');
    expect(screenFor({}, [answer])).toBe('submitted');
    expect(screenFor({ questionPhase: 'closed' })).toBe('closed');
    expect(screenFor({ answerRevealed: true })).toBe('revealed');
    expect(screenFor({ answerRevealed: true }, [answer])).toBe('revealed');
  });

  it('treats a locally refused question as closed until the phase changes', () => {
    expect(screenFor({}, [], 'active', 'q1')).toBe('closed');
  });
});

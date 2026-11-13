import { describe, it, expect } from 'vitest';
import type { QuizResponse, QuizSession } from '@/types';
import {
  LIVE_VIEW_SESSION_ID,
  liveViewResponse,
  liveViewSession,
  liveViewStats,
  liveViewSupported,
  newestAnswerQuestionId,
  studentQuestionOrder,
} from './quizLiveView';

const question = (id: string) => ({
  id,
  type: 'MC' as const,
  text: `Question ${id}`,
  timeLimit: 0,
  choices: ['a', 'b'],
});

const SESSION = {
  id: 'session-1',
  assignmentId: 'session-1',
  teacherUid: 'teacher-1',
  status: 'active',
  sessionMode: 'student',
  totalQuestions: 3,
  publicQuestions: [question('q1'), question('q2'), question('q3')],
  tabWarningsEnabled: true,
  inputSignals: true,
  allowCrossOut: true,
  reviewStep: true,
  timeLimitMinutes: 30,
  closeAt: 5,
} as unknown as QuizSession;

const RESPONSE = {
  studentUid: 'student-1',
  joinedAt: 1_000,
  status: 'in-progress',
  answers: [
    { questionId: 'q1', answer: 'a', answeredAt: 2_000, status: 'submitted' },
    { questionId: 'q3', answer: 'b', answeredAt: 4_000, status: 'draft' },
  ],
  score: null,
  submittedAt: null,
  completedAttempts: 0,
  unlocked: true,
  tabExits: [
    {
      leftAt: 2_500,
      returnedAt: 3_500,
      durationMs: 1_000,
      attempt: 0,
      outcome: 'returned',
    },
    { leftAt: 100, durationMs: 9_000, attempt: 1, outcome: 'returned' },
  ],
  inputSignals: {
    '0': { q1: { keys: 4, pastes: 1, pastedChars: 20, dels: 2 } },
  },
} as unknown as QuizResponse;

describe('liveViewSession', () => {
  it('keeps the questions and drops everything that locks, times out or records', () => {
    const mirror = liveViewSession(SESSION);
    expect(mirror.id).toBe(LIVE_VIEW_SESSION_ID);
    expect(mirror.publicQuestions).toBe(SESSION.publicQuestions);
    expect(mirror.tabWarningsEnabled).toBe(false);
    expect(mirror.inputSignals).toBeUndefined();
    expect(mirror.allowCrossOut).toBeUndefined();
    expect(mirror.reviewStep).toBe(false);
    expect(mirror.timeLimitMinutes).toBeUndefined();
    expect(mirror.closeAt).toBeUndefined();
  });

  it('covers self-paced runs only', () => {
    expect(liveViewSupported(SESSION)).toBe(true);
    expect(liveViewSupported({ ...SESSION, sessionMode: 'teacher' })).toBe(
      false
    );
  });
});

describe('liveViewResponse', () => {
  it('hides the unlock prompt a student would see', () => {
    expect(liveViewResponse(RESPONSE).unlocked).toBe(false);
  });
});

describe('newestAnswerQuestionId', () => {
  it('is the question touched last, or null with no answers', () => {
    expect(newestAnswerQuestionId(RESPONSE)).toBe('q3');
    expect(newestAnswerQuestionId({ ...RESPONSE, answers: [] })).toBeNull();
  });
});

describe('studentQuestionOrder', () => {
  it('follows a bank draw, then an override subset', () => {
    expect(
      studentQuestionOrder(SESSION, {
        ...RESPONSE,
        servedQuestionIds: ['q3', 'q1'],
      }).map((q) => q.id)
    ).toEqual(['q3', 'q1']);
    expect(
      studentQuestionOrder(SESSION, RESPONSE, { questionIds: ['q2'] }).map(
        (q) => q.id
      )
    ).toEqual(['q2']);
  });

  it('shuffles the same way every time for one student and attempt', () => {
    const shuffled = { ...SESSION, shuffleQuestions: true };
    const first = studentQuestionOrder(shuffled, RESPONSE).map((q) => q.id);
    expect(studentQuestionOrder(shuffled, RESPONSE).map((q) => q.id)).toEqual(
      first
    );
    expect([...first].sort()).toEqual(['q1', 'q2', 'q3']);
  });
});

describe('liveViewStats', () => {
  it('reports place, answered count, this attempt’s exits and input totals', () => {
    const stats = liveViewStats(SESSION, RESPONSE, 'q3', 10_000);
    expect(stats.questionNumber).toBe(3);
    expect(stats.questionCount).toBe(3);
    expect(stats.answeredCount).toBe(2);
    expect(stats.startedAt).toBe(1_000);
    expect(stats.tabExits).toBe(1);
    expect(stats.awayMs).toBe(1_000);
    expect(stats.input).toEqual({
      keys: 4,
      pastes: 1,
      pastedChars: 20,
      deletions: 2,
      clicks: 0,
    });
  });

  it('says nothing about input when the assignment does not track it', () => {
    const stats = liveViewStats(
      { ...SESSION, inputSignals: undefined },
      RESPONSE,
      null,
      10_000
    );
    expect(stats.input).toBeNull();
    expect(stats.questionNumber).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { DEFAULT_QUIZ_BEHAVIOR, getQuizBehavior } from '@/utils/quizBehavior';
import type { QuizMetadata } from '@/types';

describe('getQuizBehavior', () => {
  it('returns DEFAULT_QUIZ_BEHAVIOR when metadata has no behavior', () => {
    const meta = {
      id: 'q1',
      title: 'T',
      driveFileId: 'd',
      questionCount: 0,
      createdAt: 1,
      updatedAt: 1,
    } as QuizMetadata;
    expect(getQuizBehavior(meta)).toEqual(DEFAULT_QUIZ_BEHAVIOR);
  });
  it('returns the stored behavior when present', () => {
    const behavior = {
      sessionMode: 'student' as const,
      sessionOptions: { shuffleQuestions: true },
      attemptLimit: null,
    };
    const meta = {
      id: 'q1',
      title: 'T',
      driveFileId: 'd',
      questionCount: 0,
      createdAt: 1,
      updatedAt: 1,
      behavior,
    } as QuizMetadata;
    expect(getQuizBehavior(meta)).toEqual(behavior);
  });
  it('DEFAULT has teacher mode, attemptLimit 1, shuffleAnswerOptions on', () => {
    expect(DEFAULT_QUIZ_BEHAVIOR.sessionMode).toBe('teacher');
    expect(DEFAULT_QUIZ_BEHAVIOR.attemptLimit).toBe(1);
    expect(DEFAULT_QUIZ_BEHAVIOR.sessionOptions.shuffleAnswerOptions).toBe(
      true
    );
  });
  it('DEFAULT leaves copy/paste allowed (blockCopyPaste false)', () => {
    expect(DEFAULT_QUIZ_BEHAVIOR.sessionOptions.blockCopyPaste).toBe(false);
  });
});

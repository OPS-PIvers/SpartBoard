import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUIZ_BEHAVIOR,
  formatBehaviorSummary,
  getQuizBehavior,
  toAssessmentBehavior,
} from '@/utils/quizBehavior';
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
  it('DEFAULT has student mode, attemptLimit 1, shuffleAnswerOptions on', () => {
    expect(DEFAULT_QUIZ_BEHAVIOR.sessionMode).toBe('student');
    expect(DEFAULT_QUIZ_BEHAVIOR.attemptLimit).toBe(1);
    expect(DEFAULT_QUIZ_BEHAVIOR.sessionOptions.shuffleAnswerOptions).toBe(
      true
    );
  });
  it('DEFAULT leaves copy/paste allowed (blockCopyPaste false)', () => {
    expect(DEFAULT_QUIZ_BEHAVIOR.sessionOptions.blockCopyPaste).toBe(false);
  });
  it('DEFAULT keeps learning-target grouping off', () => {
    expect(DEFAULT_QUIZ_BEHAVIOR.sessionOptions.showLearningTargets).toBe(
      false
    );
  });
});

describe('toAssessmentBehavior (Review split D8/D9)', () => {
  it('forces self-paced and strips gamification and board reveal', () => {
    const out = toAssessmentBehavior({
      sessionMode: 'teacher',
      attemptLimit: 2,
      sessionOptions: {
        shuffleQuestions: true,
        showCorrectOnBoard: true,
        speedBonusEnabled: true,
        streakBonusEnabled: true,
        showPodiumBetweenQuestions: true,
        soundEffectsEnabled: true,
        showScoreOnSubmit: true,
      },
    });
    expect(out.sessionMode).toBe('student');
    expect(out.attemptLimit).toBe(2);
    expect(out.sessionOptions).toMatchObject({
      shuffleQuestions: true,
      showScoreOnSubmit: true,
      showCorrectOnBoard: false,
      speedBonusEnabled: false,
      streakBonusEnabled: false,
      showPodiumBetweenQuestions: false,
      soundEffectsEnabled: false,
    });
  });

  it('formatBehaviorSummary can omit the mode label', () => {
    expect(formatBehaviorSummary(DEFAULT_QUIZ_BEHAVIOR)).toMatch(
      /^Assessment Mode · 1 attempt/
    );
    expect(
      formatBehaviorSummary(DEFAULT_QUIZ_BEHAVIOR, { omitMode: true })
    ).toBe('1 attempt · shuffles answers');
  });
});

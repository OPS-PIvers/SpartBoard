import { describe, it, expect } from 'vitest';
import type { QuizBehaviorSettings, QuizData } from '@/types';
import {
  buildStudentViewSession,
  focusSettingsFrom,
  withFocusSettings,
} from './quizStudentViewSession';

const QUIZ = {
  id: 'quiz-1',
  title: 'Cells',
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Which organelle makes energy?',
      timeLimit: 0,
      correctAnswer: 'Mitochondria',
      incorrectAnswers: ['Nucleus', 'Ribosome'],
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} as QuizData;

const BEHAVIOR: QuizBehaviorSettings = {
  sessionMode: 'teacher',
  sessionOptions: {
    tabWarningsEnabled: true,
    tabWarningThreshold: 2,
    tabAwayLimitSeconds: 60,
    tabAwayAutoSubmit: true,
    blockCopyPaste: true,
  },
  attemptLimit: 1,
};

describe('buildStudentViewSession', () => {
  it('builds a self-paced session with the quiz focus settings and no answer key', () => {
    const s = buildStudentViewSession(QUIZ, BEHAVIOR, true);
    expect(s.sessionMode).toBe('student');
    expect(s.status).toBe('active');
    expect(s.tabWarningThreshold).toBe(2);
    expect(s.tabAwayLimitSeconds).toBe(60);
    expect(s.tabAwayAutoSubmit).toBe(true);
    expect(s.blockCopyPaste).toBe(true);
    expect(s.publicQuestions[0]).not.toHaveProperty('correctAnswer');
    expect([...(s.publicQuestions[0].choices ?? [])].sort()).toEqual([
      'Mitochondria',
      'Nucleus',
      'Ribosome',
    ]);
  });

  it('leaves the away limit out without the tab-away-timer flag', () => {
    const s = buildStudentViewSession(QUIZ, BEHAVIOR, false);
    expect(s).not.toHaveProperty('tabAwayLimitSeconds');
  });
});

describe('withFocusSettings', () => {
  it('swaps focus fields and keeps the question order', () => {
    const base = buildStudentViewSession(QUIZ, BEHAVIOR, true);
    const next = withFocusSettings(
      base,
      {
        ...focusSettingsFrom(BEHAVIOR),
        tabWarningsEnabled: false,
        tabWarningThreshold: undefined,
        blockCopyPaste: false,
      },
      true
    );
    expect(next.publicQuestions).toBe(base.publicQuestions);
    expect(next.tabWarningsEnabled).toBe(false);
    expect(next).not.toHaveProperty('tabWarningThreshold');
    expect(next.blockCopyPaste).toBe(false);
  });
});

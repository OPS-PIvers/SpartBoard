import { describe, it, expect } from 'vitest';
import type { QuizBehaviorSettings, QuizData, QuizSession } from '@/types';
import {
  STUDENT_VIEW_SESSION_ID,
  buildAssignedStudentView,
  buildStudentViewSession,
  focusSettingsFrom,
  focusSettingsFromSession,
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

  it('keeps recording blocks and stamps the markers Assign would', () => {
    const quiz = {
      ...QUIZ,
      questions: [
        {
          id: 'q2',
          type: 'free-response',
          text: 'Show your work.',
          timeLimit: 0,
          correctAnswer: '',
          incorrectAnswers: [],
          recording: {
            mode: 'whiteboard',
            prepSeconds: 0,
            limitSeconds: 60,
            prepExpiry: 'armed',
            takeLimit: null,
          },
        },
      ],
    } as QuizData;
    const s = buildStudentViewSession(quiz, BEHAVIOR, false);
    expect(s.publicQuestions[0].recording?.mode).toBe('whiteboard');
    expect(s.mediaResponseEnabled).toBe(true);
    expect(s.whiteboardResponseEnabled).toBe(true);
  });

  it('leaves the markers off a quiz with no recording questions', () => {
    const s = buildStudentViewSession(QUIZ, BEHAVIOR, false);
    expect(s).not.toHaveProperty('mediaResponseEnabled');
    expect(s).not.toHaveProperty('whiteboardResponseEnabled');
  });

  it('always stamps the one-list Ordering marker and the review step, as Assign does', () => {
    const s = buildStudentViewSession(QUIZ, BEHAVIOR, false);
    expect(s.orderingList).toBe(true);
    expect(s.reviewStep).toBe(true);
  });
});

describe('buildStudentViewSession stimulus tabs', () => {
  it('leaves stimulus tabs off without the teacher’s flag', () => {
    const s = buildStudentViewSession(QUIZ, BEHAVIOR, false);
    expect(s).not.toHaveProperty('stimulusTabs');
  });

  it('stamps stimulus tabs with the flag, as Assign does', () => {
    const s = buildStudentViewSession(QUIZ, BEHAVIOR, false, {
      stimulusTabs: true,
    });
    expect(s.stimulusTabs).toBe(true);
  });
});

describe('buildStudentViewSession cross-out', () => {
  it('leaves cross-out off without the teacher’s flag', () => {
    const s = buildStudentViewSession(QUIZ, BEHAVIOR, false);
    expect(s).not.toHaveProperty('allowCrossOut');
  });

  it('stamps cross-out with the flag, as Assign does', () => {
    const s = buildStudentViewSession(QUIZ, BEHAVIOR, false, {
      crossOut: true,
    });
    expect(s.allowCrossOut).toBe(true);
  });
});

describe('buildAssignedStudentView', () => {
  const live = {
    ...buildStudentViewSession(QUIZ, BEHAVIOR, true),
    id: 'real-session',
    assignmentId: 'real-session',
    teacherUid: 'teacher-1',
    code: 'ABC123',
    status: 'paused',
    closeAt: 5,
    inputSignals: true,
    tabWarningThreshold: 4,
  } as QuizSession;

  it('keeps the assigned questions and settings but nothing that gates or writes', () => {
    const { session, drawIds } = buildAssignedStudentView(live, null);
    expect(session.id).toBe(STUDENT_VIEW_SESSION_ID);
    expect(session.teacherUid).toBe('');
    expect(session.status).toBe('active');
    expect(session.closeAt).toBeUndefined();
    expect(session.inputSignals).toBeUndefined();
    expect(session.publicQuestions).toEqual(live.publicQuestions);
    expect(focusSettingsFromSession(session).tabWarningThreshold).toBe(4);
    expect(drawIds).toBeUndefined();
  });

  it('reads a per-period assignment from its content doc', () => {
    const { session } = buildAssignedStudentView(
      {
        ...live,
        publicQuestions: [],
        questionsInContent: true,
        periodAccess: {},
      },
      { publicQuestions: live.publicQuestions }
    );
    expect(session.publicQuestions).toHaveLength(1);
    expect(session.questionsInContent).toBeUndefined();
    expect(session.periodAccess).toBeUndefined();
  });

  it('serves one sample draw for question-bank slots', () => {
    const pool = ['a', 'b', 'c'].map((id) => ({
      ...live.publicQuestions[0],
      id,
    }));
    const { drawIds } = buildAssignedStudentView(
      {
        ...live,
        publicQuestions: pool,
        bankSlots: [
          {
            id: 's1',
            count: 2,
            points: 1,
            poolQuestionIds: ['a', 'b', 'c'],
            position: 0,
          },
        ],
      },
      null
    );
    expect(drawIds).toHaveLength(2);
  });
});

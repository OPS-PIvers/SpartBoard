/**
 * sessionViewsMocks — fixture builders for SessionViewsDevHarness.
 *
 * Each builder returns an object typed as the REAL data type from `@/types`
 * (no `any` casts), so the harness exercises the live monitor/results views
 * against representative data without a Firestore round-trip. The fixtures
 * deliberately span the interesting per-student states the views branch on:
 *   - completed responses across the score spectrum (high / mid / low)
 *   - an in-progress attempt
 *   - a joined-only attempt (no answers yet)
 *   - a response carrying tab-switch warnings
 *   - a locked / auto-submitted response
 *
 * Keep these as plain data — no React, no Firestore. They must satisfy every
 * REQUIRED field on the underlying interfaces (`pnpm run type-check` is the
 * gate); optional fields are filled only where a view reads them.
 */

import {
  QuizSession,
  QuizSessionStatus,
  QuizResponse,
  QuizResponseStatus,
  QuizData,
  QuizConfig,
  QuizPublicQuestion,
  VideoActivitySession,
  VideoActivityResponse,
  VideoActivityQuestion,
} from '@/types';

const QUIZ_ID = 'dev-quiz-1';
const QUIZ_SESSION_ID = 'dev-quiz-session-1';
const VA_ID = 'dev-va-1';
const VA_SESSION_ID = 'dev-va-session-1';

// Stable-ish base time so timestamps look realistic relative to one another.
const NOW = 1_700_000_000_000;

/* ─── Quiz quiz data ─────────────────────────────────────────────────────── */

const QUIZ_Q1_ID = 'q1';
const QUIZ_Q2_ID = 'q2';

export function makeQuizData(): QuizData {
  return {
    id: QUIZ_ID,
    title: 'Fractions Review',
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 3_600_000,
    questions: [
      {
        id: QUIZ_Q1_ID,
        type: 'MC',
        text: 'What is 1/2 + 1/4?',
        timeLimit: 30,
        correctAnswer: '3/4',
        incorrectAnswers: ['1/4', '2/6', '1/8'],
        points: 1,
      },
      {
        id: QUIZ_Q2_ID,
        type: 'FIB',
        text: 'Simplify 4/8 to lowest terms.',
        timeLimit: 0,
        correctAnswer: '1/2',
        incorrectAnswers: [],
        points: 1,
      },
    ],
  };
}

function quizPublicQuestions(): QuizPublicQuestion[] {
  return [
    {
      id: QUIZ_Q1_ID,
      type: 'MC',
      text: 'What is 1/2 + 1/4?',
      timeLimit: 30,
      choices: ['3/4', '1/4', '2/6', '1/8'],
    },
    {
      id: QUIZ_Q2_ID,
      type: 'FIB',
      text: 'Simplify 4/8 to lowest terms.',
      timeLimit: 0,
    },
  ];
}

export function makeQuizSession(
  status: QuizSessionStatus = 'active'
): QuizSession {
  return {
    id: QUIZ_SESSION_ID,
    assignmentId: QUIZ_SESSION_ID,
    quizId: QUIZ_ID,
    quizTitle: 'Fractions Review',
    teacherUid: 'mock-user-id',
    status,
    sessionMode: 'teacher',
    currentQuestionIndex: status === 'waiting' ? -1 : 0,
    startedAt: status === 'waiting' ? null : NOW - 600_000,
    endedAt: status === 'ended' ? NOW - 60_000 : null,
    code: 'ABC123',
    totalQuestions: 2,
    publicQuestions: quizPublicQuestions(),
    periodNames: ['Period 3'],
    tabWarningsEnabled: true,
  };
}

export function makeQuizConfig(): QuizConfig {
  return {
    view: 'monitor',
    selectedQuizId: QUIZ_ID,
    selectedQuizTitle: 'Fractions Review',
    activeAssignmentId: QUIZ_SESSION_ID,
    activeLiveSessionCode: 'ABC123',
    resultsSessionId: QUIZ_SESSION_ID,
    periodNames: ['Period 3'],
  };
}

/* ─── Quiz responses ─────────────────────────────────────────────────────── */

function quizCompleted(
  key: string,
  pin: string,
  q1Answer: string,
  q2Answer: string,
  warnings = 0
): QuizResponse {
  return {
    _responseKey: key,
    studentUid: key,
    pin,
    joinedAt: NOW - 540_000,
    status: 'completed' as QuizResponseStatus,
    answers: [
      { questionId: QUIZ_Q1_ID, answer: q1Answer, answeredAt: NOW - 480_000 },
      { questionId: QUIZ_Q2_ID, answer: q2Answer, answeredAt: NOW - 420_000 },
    ],
    score: null,
    submittedAt: NOW - 400_000,
    classPeriod: 'Period 3',
    completedAttempts: 1,
    ...(warnings > 0 ? { tabSwitchWarnings: warnings } : {}),
  };
}

export function makeQuizResponses(): QuizResponse[] {
  return [
    // High score — both correct.
    quizCompleted('pin-Period 3-1001', '1001', '3/4', '1/2'),
    // Mid score — first correct, second wrong.
    quizCompleted('pin-Period 3-1002', '1002', '3/4', '2/4'),
    // Low score — both wrong, plus a tab-switch warning.
    quizCompleted('pin-Period 3-1003', '1003', '1/4', '4/8', 2),
    // In-progress — one answer submitted, not finished.
    {
      _responseKey: 'pin-Period 3-1004',
      studentUid: 'pin-Period 3-1004',
      pin: '1004',
      joinedAt: NOW - 300_000,
      status: 'in-progress',
      answers: [
        { questionId: QUIZ_Q1_ID, answer: '3/4', answeredAt: NOW - 200_000 },
      ],
      score: null,
      submittedAt: null,
      classPeriod: 'Period 3',
    },
    // Joined only — no answers yet.
    {
      _responseKey: 'pin-Period 3-1005',
      studentUid: 'pin-Period 3-1005',
      pin: '1005',
      joinedAt: NOW - 120_000,
      status: 'joined',
      answers: [],
      score: null,
      submittedAt: null,
      classPeriod: 'Period 3',
    },
    // Locked / auto-submitted attempt.
    {
      _responseKey: 'pin-Period 3-1006',
      studentUid: 'pin-Period 3-1006',
      pin: '1006',
      joinedAt: NOW - 500_000,
      status: 'completed',
      answers: [
        { questionId: QUIZ_Q1_ID, answer: '1/8', answeredAt: NOW - 470_000 },
      ],
      score: null,
      submittedAt: NOW - 450_000,
      classPeriod: 'Period 3',
      completedAttempts: 1,
      autoSubmitted: true,
      tabSwitchWarnings: 3,
    },
  ];
}

/* ─── Video Activity data ────────────────────────────────────────────────── */

const VA_Q1_ID = 'vq1';
const VA_Q2_ID = 'vq2';

function vaQuestions(): VideoActivityQuestion[] {
  return [
    {
      id: VA_Q1_ID,
      type: 'MC',
      text: 'What gas do plants absorb during photosynthesis?',
      timeLimit: 0,
      timestamp: 45,
      correctAnswer: 'Carbon dioxide',
      incorrectAnswers: ['Oxygen', 'Nitrogen', 'Hydrogen'],
      points: 1,
    },
    {
      id: VA_Q2_ID,
      type: 'FIB',
      text: 'Photosynthesis happens in the ____ of the cell.',
      timeLimit: 0,
      timestamp: 120,
      correctAnswer: 'chloroplast',
      incorrectAnswers: [],
      points: 1,
    },
  ];
}

export function makeVaSession(
  status: VideoActivitySession['status'] = 'active'
): VideoActivitySession {
  return {
    id: VA_SESSION_ID,
    activityId: VA_ID,
    activityTitle: 'Photosynthesis Explained',
    assignmentName: 'Photosynthesis — Period 1',
    teacherUid: 'mock-user-id',
    youtubeUrl: 'https://www.youtube.com/watch?v=dev-mock',
    questions: vaQuestions(),
    status,
    allowedPins: [],
    createdAt: NOW - 7_200_000,
    endedAt: status === 'ended' ? NOW - 60_000 : undefined,
    periodNames: ['Period 1'],
  };
}

/* ─── Video Activity responses ───────────────────────────────────────────── */

function vaResponse(
  key: string,
  pin: string,
  answers: { questionId: string; answer: string }[],
  completed: boolean,
  warnings = 0
): VideoActivityResponse {
  return {
    _responseKey: key,
    studentUid: key,
    pin,
    joinedAt: NOW - 540_000,
    answers: answers.map((a, i) => ({
      questionId: a.questionId,
      answer: a.answer,
      answeredAt: NOW - 480_000 + i * 30_000,
    })),
    completedAt: completed ? NOW - 400_000 : null,
    score: null,
    classPeriod: 'Period 1',
    ...(completed ? { completedAttempts: 1 } : {}),
    ...(warnings > 0 ? { tabSwitchWarnings: warnings } : {}),
  };
}

export function makeVaResponses(): VideoActivityResponse[] {
  return [
    // Both correct.
    vaResponse(
      'pin-Period 1-2001',
      '2001',
      [
        { questionId: VA_Q1_ID, answer: 'Carbon dioxide' },
        { questionId: VA_Q2_ID, answer: 'chloroplast' },
      ],
      true
    ),
    // One correct, one wrong.
    vaResponse(
      'pin-Period 1-2002',
      '2002',
      [
        { questionId: VA_Q1_ID, answer: 'Carbon dioxide' },
        { questionId: VA_Q2_ID, answer: 'nucleus' },
      ],
      true
    ),
    // Both wrong, with tab warnings.
    vaResponse(
      'pin-Period 1-2003',
      '2003',
      [
        { questionId: VA_Q1_ID, answer: 'Oxygen' },
        { questionId: VA_Q2_ID, answer: 'mitochondria' },
      ],
      true,
      2
    ),
    // In-progress — one answer so far.
    vaResponse(
      'pin-Period 1-2004',
      '2004',
      [{ questionId: VA_Q1_ID, answer: 'Carbon dioxide' }],
      false
    ),
    // Joined only — no answers.
    vaResponse('pin-Period 1-2005', '2005', [], false),
  ];
}

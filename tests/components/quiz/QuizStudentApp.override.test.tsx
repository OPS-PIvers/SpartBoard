/**
 * M17 C3 — per-student pointer override materialization in the self-paced
 * quiz flow: question subset serving, hidden MC options, and served-subset
 * denominators (spec §3a-F). Extended-time multiplier and tab-warning
 * threshold precedence are covered by `utils/quizOverrideServing.test.ts`
 * and `utils/tabWarningThreshold.test.ts` respectively; this file pins down
 * the end-to-end wiring inside `QuizStudentApp`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  QuizSession,
  QuizResponse,
  QuizPublicQuestion,
  QuizQuestion,
  StudentOverride,
  StudentAssignmentPointer,
} from '@/types';
import { translateHiddenOptionIdsToText } from '@/utils/quizHiddenOptions';

const {
  mockAuth,
  mockJoinQuizSession,
  hookState,
  pointerState,
  mockSetServedQuestionIds,
} = vi.hoisted(() => {
  type MockUser = {
    uid: string;
    isAnonymous: boolean;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  };
  const state: {
    session: import('@/types').QuizSession | null;
    myResponse: import('@/types').QuizResponse | null;
  } = { session: null, myResponse: null };
  return {
    mockAuth: {
      onAuthStateChanged: vi.fn(),
      signInWithPopup: vi.fn(),
      signOut: vi.fn(),
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as MockUser | null,
    },
    mockJoinQuizSession: vi.fn(),
    hookState: state,
    pointerState: {
      current: null as StudentAssignmentPointer | null | undefined,
    },
    mockSetServedQuestionIds: vi.fn(),
  };
});

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => pointerState.current,
}));

vi.mock('@/config/firebase', () => ({
  isConfigured: false,
  isAuthBypass: false,
  app: {},
  db: {},
  auth: mockAuth,
  storage: {},
  functions: {},
  GOOGLE_OAUTH_SCOPES: [] as string[],
  googleProvider: {},
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
  onAuthStateChanged: vi.fn(() => () => undefined),
}));

vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionStudent: () => ({
    session: hookState.session,
    myResponse: hookState.myResponse,
    loading: false,
    error: null,
    sessionIdRef: { current: 'session-1' },
    lookupSession: vi.fn(),
    joinQuizSession: mockJoinQuizSession,
    submitAnswer: vi.fn(),
    completeQuiz: vi.fn(),
    reportTabSwitch: vi.fn(),
    setServedQuestionIds: mockSetServedQuestionIds,
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

function mintUser(uid: string) {
  return {
    uid,
    isAnonymous: false,
    getIdTokenResult: () => Promise.resolve({ claims: { studentRole: true } }),
  };
}

function setSearch(search: string): void {
  window.history.replaceState({}, '', `/quiz${search}`);
}

const QUESTIONS: QuizPublicQuestion[] = [
  {
    id: 'q1',
    type: 'MC',
    text: 'What is 2 + 2?',
    timeLimit: 30,
    choices: ['3', '4', '5', '22'],
  },
  {
    id: 'q2',
    type: 'MC',
    text: 'Capital of France?',
    timeLimit: 0,
    choices: ['London', 'Paris', 'Berlin', 'Madrid'],
  },
  {
    id: 'q3',
    type: 'MC',
    text: 'Color of the sky?',
    timeLimit: 0,
    choices: ['Green', 'Red', 'Blue', 'Yellow'],
  },
];

// The teacher-side quiz body the B2 override editor is built from. Option
// ids follow `QuizManager.toOverrideEditorQuestions`.
const QUIZ_BODY: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'MC',
    text: 'What is 2 + 2?',
    timeLimit: 30,
    correctAnswer: '4',
    incorrectAnswers: ['3', '5', '22'],
  },
  {
    id: 'q2',
    type: 'MC',
    text: 'Capital of France?',
    timeLimit: 0,
    correctAnswer: 'Paris',
    incorrectAnswers: ['London', 'Berlin', 'Paris'],
  },
];

function buildSession(overrides: Partial<QuizSession> = {}): QuizSession {
  return {
    id: 'session-1',
    assignmentId: 'asn-1',
    quizId: 'quiz-1',
    quizTitle: 'Test quiz',
    teacherUid: 'teacher-1',
    status: 'active',
    sessionMode: 'student',
    currentQuestionIndex: 0,
    startedAt: Date.now(),
    endedAt: null,
    code: 'ABC123',
    totalQuestions: QUESTIONS.length,
    publicQuestions: QUESTIONS,
    ...overrides,
  };
}

function buildResponse(overrides: Partial<QuizResponse> = {}): QuizResponse {
  return {
    studentUid: 'sso-uid-1',
    joinedAt: Date.now(),
    status: 'in-progress',
    answers: [],
    score: null,
    submittedAt: null,
    completedAttempts: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.session = buildSession();
  hookState.myResponse = buildResponse();
  pointerState.current = null;
  mockAuth.currentUser = mintUser('sso-uid-1');
  mockJoinQuizSession.mockResolvedValue('session-1');
  setSearch('?code=ABC123');
});

describe('QuizStudentApp — M17 C3 override materialization', () => {
  it('serves only the overridden question subset, in original order', async () => {
    pointerState.current = {
      kind: 'quiz',
      sessionId: 'session-1',
      teacherUid: 'teacher-1',
      classId: 'class-1',
      override: { questionIds: ['q3', 'q1'] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<QuizStudentApp />);

    // q1 is the first served question (subset order follows the session's
    // original question order, not the override's list order).
    await waitFor(() =>
      expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument()
    );
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('hides options authored as B2 editor ids, translated at save time', async () => {
    // End-to-end: the B2 editor emits structured ids, the save path
    // translates them to text, and only text lands on the pointer doc.
    const authored: Record<string, StudentOverride> = {
      'classlink:s1': {
        hiddenOptionIdsByQuestion: {
          q1: ['q1-incorrect-1', 'q1-incorrect-2'],
        },
      },
    };
    const { overridesByKey } = translateHiddenOptionIdsToText(
      QUIZ_BODY,
      authored
    );
    const served = overridesByKey['classlink:s1'];
    expect(served.hiddenOptionIdsByQuestion).toEqual({ q1: ['5', '22'] });
    expect(JSON.stringify(served)).not.toContain('-incorrect-');
    expect(JSON.stringify(served)).not.toContain('-correct');

    pointerState.current = {
      kind: 'quiz',
      sessionId: 'session-1',
      teacherUid: 'teacher-1',
      classId: 'class-1',
      override: served,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<QuizStudentApp />);

    await waitFor(() =>
      expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument()
    );
    expect(screen.queryByText('22')).not.toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('keeps a duplicate-text distractor visible so the key survives', async () => {
    // 'q2-incorrect-2' duplicates the correct answer's text — hiding by text
    // would take the key down with it, so translation refuses it.
    const { overridesByKey, warnings } = translateHiddenOptionIdsToText(
      QUIZ_BODY,
      {
        'classlink:s1': {
          hiddenOptionIdsByQuestion: {
            q2: ['q2-incorrect-0', 'q2-incorrect-2'],
          },
        },
      }
    );
    const served = overridesByKey['classlink:s1'];
    expect(served.hiddenOptionIdsByQuestion).toEqual({ q2: ['London'] });
    expect(warnings).toHaveLength(1);

    pointerState.current = {
      kind: 'quiz',
      sessionId: 'session-1',
      teacherUid: 'teacher-1',
      classId: 'class-1',
      override: { ...served, questionIds: ['q2'] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<QuizStudentApp />);

    await waitFor(() =>
      expect(screen.getByText('Capital of France?')).toBeInTheDocument()
    );
    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.queryByText('London')).not.toBeInTheDocument();
  });

  it('lists only served questions in the published review', async () => {
    hookState.session = buildSession({
      scoreVisibility: 'score-and-responses',
    });
    hookState.myResponse = buildResponse({
      status: 'completed',
      score: 100,
      answers: [{ questionId: 'q1', answer: '4', answeredAt: Date.now() }],
    });
    pointerState.current = {
      kind: 'quiz',
      sessionId: 'session-1',
      teacherUid: 'teacher-1',
      classId: 'class-1',
      override: { questionIds: ['q1', 'q3'] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<QuizStudentApp />);

    await waitFor(() =>
      expect(screen.getByText('Your Answers')).toBeInTheDocument()
    );
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    expect(screen.getByText('Color of the sky?')).toBeInTheDocument();
    expect(screen.queryByText('Capital of France?')).not.toBeInTheDocument();
  });

  it('renders the full count with no override (legacy unchanged)', async () => {
    pointerState.current = null;

    render(<QuizStudentApp />);

    await waitFor(() => expect(screen.getByText('1 / 3')).toBeInTheDocument());
  });

  it('does not push a served subset while the pointer is still loading', async () => {
    pointerState.current = undefined;

    render(<QuizStudentApp />);

    await waitFor(() => expect(screen.getByText('1 / 3')).toBeInTheDocument());
    expect(mockSetServedQuestionIds).not.toHaveBeenCalled();
  });

  it('pushes null once the pointer resolves with no override', async () => {
    pointerState.current = null;

    render(<QuizStudentApp />);

    await waitFor(() =>
      expect(mockSetServedQuestionIds).toHaveBeenCalledWith(null)
    );
  });
});

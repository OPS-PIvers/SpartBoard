import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  QuizSession,
  QuizResponse,
  QuizPublicQuestion,
  StudentOverride,
  StudentAssignmentPointer,
} from '@/types';
import type {
  DictationController,
  UseDictationOptions,
} from '@/utils/speechToText/types';

const {
  mockAuth,
  mockJoinQuizSession,
  hookState,
  pointerState,
  mockSetServedQuestionIds,
  mockSubmitAnswer,
  dictationHook,
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
    mockSubmitAnswer: vi.fn().mockResolvedValue(undefined),
    dictationHook: {
      options: null as
        import('@/utils/speechToText/types').UseDictationOptions | null,
    },
  };
});

vi.mock('@/hooks/useDictation', () => ({
  useDictation: (options: UseDictationOptions): DictationController => {
    dictationHook.options = options;
    return {
      supported: true,
      status: 'idle',
      error: null,
      interim: '',
      language: 'en',
      languages: options.languages,
      setLanguage: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      toggle: () => undefined,
    };
  },
}));
vi.mock('@/components/common/dictate/DictateButton', () => ({
  DictateButton: () => <button type="button">Dictate</button>,
}));

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
    submitAnswer: mockSubmitAnswer,
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
    type: 'FIB',
    text: 'The largest animal is the ___.',
    timeLimit: 0,
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
  mockSubmitAnswer.mockResolvedValue(undefined);
  dictationHook.options = null;
  setSearch('?code=ABC123');
});

const withOverride = (override: StudentOverride | undefined) => {
  pointerState.current = {
    kind: 'quiz',
    sessionId: 'session-1',
    teacherUid: 'teacher-1',
    classId: 'class-1',
    ...(override ? { override } : {}),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

describe('QuizStudentApp: Speech to text', () => {
  it('offers Dictate on a blank only to a student with the accommodation', async () => {
    withOverride({ timeMultiplier: 1.5 });
    const { unmount } = render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull();
    unmount();

    withOverride({ speechToText: true, language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Dictate' })
      ).toBeInTheDocument()
    );
    expect(dictationHook.options?.languages).toEqual(['en', 'es']);
    expect(dictationHook.options?.singlePhrase).toBe(true);
  });

  it('fills the blank with the phrase and saves the answer as dictated', async () => {
    withOverride({ speechToText: true });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Dictate' })
      ).toBeInTheDocument()
    );
    act(() => dictationHook.options?.onCommit(' Blue whale.'));
    const box = screen.getByRole<HTMLInputElement>('textbox');
    await waitFor(() => expect(box.value).toBe('Blue whale'));
    box.focus();
    await act(async () => {
      box.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      );
      await Promise.resolve();
    });
    await waitFor(() => expect(mockSubmitAnswer).toHaveBeenCalled());
    const call = mockSubmitAnswer.mock.calls.find(
      (c) => (c[3] as { isDraft?: boolean } | undefined)?.isDraft !== true
    ) as unknown[];
    expect(call[0]).toBe('q1');
    expect(call[1]).toBe('Blue whale');
    expect(call[3]).toMatchObject({ dictated: true });
  });
});

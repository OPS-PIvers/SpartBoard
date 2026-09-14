/**
 * Read-aloud eligibility and placement in the self-paced student shell
 * (docs/plans/QUIZ_READ_ALOUD.md §6.2). Audio itself is not exercised here;
 * the assertions are about which controls mount for whom.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type {
  QuizSession,
  QuizResponse,
  QuizPublicQuestion,
  StudentAssignmentPointer,
} from '@/types';

const { mockAuth, hookState, pointerState } = vi.hoisted(() => {
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
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as MockUser | null,
    },
    hookState: state,
    pointerState: {
      current: null as StudentAssignmentPointer | null | undefined,
    },
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

vi.mock('@/utils/quizReadAloudApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizReadAloudApi')>();
  return {
    ...actual,
    synthesizeQuizAudio: vi.fn(),
    prepareQuizReadAloud: vi.fn(),
    resolveReadAloudUrl: vi.fn(() => Promise.resolve('blob:audio')),
  };
});

vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionStudent: () => ({
    session: hookState.session,
    myResponse: hookState.myResponse,
    loading: false,
    error: null,
    sessionIdRef: { current: 'session-1' },
    lookupSession: vi.fn(),
    joinQuizSession: vi.fn().mockResolvedValue('session-1'),
    submitAnswer: vi.fn(),
    completeQuiz: vi.fn(),
    reportTabSwitch: vi.fn(),
    setServedQuestionIds: vi.fn(),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

const QUESTIONS: QuizPublicQuestion[] = [
  {
    id: 'q1',
    type: 'MC',
    text: 'What is 2 + 2?',
    timeLimit: 0,
    choices: ['3', '4', '5', '22'],
  },
  {
    id: 'q2',
    type: 'Matching',
    text: 'Match the capitals.',
    timeLimit: 0,
    matchingLeft: ['France', 'Spain'],
    matchingRight: ['Paris', 'Madrid'],
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
    shuffleAnswerOptions: false,
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

function pointer(override?: StudentAssignmentPointer['override']) {
  return {
    kind: 'quiz' as const,
    sessionId: 'session-1',
    teacherUid: 'teacher-1',
    classId: 'class-1',
    ...(override ? { override } : {}),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const ssoUser = {
  uid: 'sso-uid-1',
  isAnonymous: false,
  getIdTokenResult: () => Promise.resolve({ claims: { studentRole: true } }),
};
const anonUser = {
  uid: 'anon-1',
  isAnonymous: true,
  getIdTokenResult: () => Promise.resolve({ claims: {} }),
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  hookState.session = buildSession();
  hookState.myResponse = buildResponse();
  pointerState.current = pointer();
  mockAuth.currentUser = ssoUser;
  window.history.replaceState({}, '', '/quiz?code=ABC123');
});

const waitForQuestion = () =>
  waitFor(
    () => expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument(),
    {
      timeout: 4000,
    }
  );

describe('QuizStudentApp — read-aloud eligibility', () => {
  it('mounts nothing read-aloud for an unflagged SSO student', async () => {
    render(<QuizStudentApp />);
    await waitForQuestion();
    expect(screen.queryByRole('button', { name: 'Read question' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: /Read choice/ })).toBeNull();
  });

  it('shows the toolbar, prompt speaker and one speaker per MC row for an override', async () => {
    pointerState.current = pointer({ readAloud: true });
    render(<QuizStudentApp />);
    await waitForQuestion();
    expect(
      screen.getByRole('button', { name: 'Read question' })
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Auto-read' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(
      screen.getByRole('button', { name: 'Speed 1×' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Read question aloud' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Read choice \d aloud/ })
    ).toHaveLength(4);
    // The answer itself stays a plain button, the speaker sits beside it.
    const answer = screen.getByRole('button', { name: '4' });
    expect(answer.querySelector('[aria-label]')).toBeNull();
  });

  it('honours readAloudAll on the session without an override', async () => {
    hookState.session = buildSession({ readAloudAll: true });
    render(<QuizStudentApp />);
    await waitForQuestion();
    expect(
      screen.getByRole('button', { name: 'Read question' })
    ).toBeInTheDocument();
  });

  it('never mounts for an anonymous PIN joiner, even with readAloudAll', async () => {
    mockAuth.currentUser = anonUser;
    pointerState.current = null;
    hookState.session = buildSession({ readAloudAll: true });
    const user = userEvent.setup();
    render(<QuizStudentApp />);
    await user.type(await screen.findByPlaceholderText('Your PIN'), '1234');
    fireEvent.submit(
      screen
        .getByRole('button', { name: /join/i })
        .closest('form') as HTMLFormElement
    );
    await waitForQuestion();
    expect(screen.queryByRole('button', { name: 'Read question' })).toBeNull();
  });

  it('never mounts in the teacher-paced (dark) shell', async () => {
    pointerState.current = pointer({ readAloud: true });
    hookState.session = buildSession({
      readAloudAll: true,
      sessionMode: 'teacher',
    });
    render(<QuizStudentApp />);
    await waitForQuestion();
    expect(screen.queryByRole('button', { name: 'Read question' })).toBeNull();
  });

  it('shows the passage speaker only for an attached image stimulus with reviewed text', async () => {
    pointerState.current = pointer({ readAloud: true });
    hookState.session = buildSession({
      publicQuestions: [
        { ...QUESTIONS[0], stimulusIds: ['img'] },
        QUESTIONS[1],
      ],
      stimuli: [
        { id: 'img', type: 'image', url: 'https://x.test/a.png', label: '' },
        { id: 'other', type: 'image', url: 'https://x.test/b.png', label: '' },
      ],
      readAloudTextByStimulusId: { img: 'A sign reads STOP.', other: 'Never' },
    });
    render(<QuizStudentApp />);
    await waitForQuestion();
    expect(
      screen.getAllByRole('button', { name: 'Read passage aloud' })
    ).toHaveLength(1);
    // The pane only opens while the passage plays.
    expect(screen.queryByTestId('stimulus-read-aloud-pane')).toBeNull();
  });

  it('mounts no passage speaker when the stimulus has no reviewed text', async () => {
    pointerState.current = pointer({ readAloud: true });
    hookState.session = buildSession({
      publicQuestions: [
        { ...QUESTIONS[0], stimulusIds: ['img'] },
        QUESTIONS[1],
      ],
      stimuli: [
        { id: 'img', type: 'image', url: 'https://x.test/a.png', label: '' },
      ],
    });
    render(<QuizStudentApp />);
    await waitForQuestion();
    expect(
      screen.queryByRole('button', { name: 'Read passage aloud' })
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Read question aloud' })
    ).toBeInTheDocument();
  });

  it('asks for Spanish audio and reads the locale manifest slice on a translated view', async () => {
    const api = await import('@/utils/quizReadAloudApi');
    const synthesize = vi.mocked(api.synthesizeQuizAudio);
    synthesize.mockResolvedValue({
      path: 'p.mp3',
      mimeType: 'audio/mpeg',
      chars: 5,
      cached: false,
    });
    pointerState.current = pointer({ readAloud: true, language: 'es' });
    hookState.session = buildSession({
      publicQuestions: [
        {
          ...QUESTIONS[0],
          localized: {
            es: { text: '¿Cuánto es 2 + 2?', choices: ['3', '4', '5', '22'] },
          },
        },
        QUESTIONS[1],
      ],
    });
    const user = userEvent.setup();
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('¿Cuánto es 2 + 2?')).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('button', {
        name: /^(Read question|Leer pregunta)$/,
      })
    );
    await waitFor(() => expect(synthesize).toHaveBeenCalled());
    expect(synthesize.mock.calls[0][0]).toMatchObject({
      mode: 'student',
      locale: 'es',
    });
  });

  it('puts a speaker beside every matching term and definition', async () => {
    pointerState.current = pointer({ readAloud: true, questionIds: ['q2'] });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Match the capitals.')).toBeInTheDocument()
    );
    expect(
      screen.getAllByRole('button', { name: 'Read item aloud' })
    ).toHaveLength(4);
  });
});

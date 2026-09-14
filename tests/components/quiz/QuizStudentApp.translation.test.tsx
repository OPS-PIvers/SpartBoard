/**
 * PR3 student serving: localized rendering, the one segmented toggle, the
 * per-question English fallback matrix, hydration across a locale change,
 * per-call `locale` stamping (D18), the D34 localStorage guard and the D25
 * read-aloud suppression. Harness mirrors QuizStudentApp.override.test.tsx.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type {
  QuizSession,
  QuizResponse,
  QuizPublicQuestion,
  StudentAssignmentPointer,
  StudentOverride,
} from '@/types';

const {
  mockAuth,
  mockJoinQuizSession,
  hookState,
  pointerState,
  mockSubmit,
  mockCommitRecording,
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
    mockSubmit: vi.fn(),
    mockCommitRecording: vi.fn(),
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

vi.mock('@/components/quiz/recording/AudioResponseCapture', () => ({
  AudioResponseCapture: (props: {
    onCommit: (take: {
      blob: Blob;
      mimeType: string;
      durationMs: number;
    }) => Promise<void>;
  }) => (
    <button
      type="button"
      onClick={() =>
        void props.onCommit({
          blob: new Blob(['x']),
          mimeType: 'audio/webm',
          durationMs: 1000,
        })
      }
    >
      commit-take
    </button>
  ),
}));

vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionStudent: () => ({
    commitRecordingTake: mockCommitRecording,
    setArtifactUploadState: vi.fn(),
    markUnresponded: vi.fn(),
    acknowledgeRecordingNotice: vi.fn(),
    session: hookState.session,
    myResponse: hookState.myResponse,
    loading: false,
    error: null,
    sessionIdRef: { current: 'session-1' },
    lookupSession: vi.fn(),
    joinQuizSession: mockJoinQuizSession,
    submitAnswer: mockSubmit,
    completeQuiz: vi.fn(),
    reportTabSwitch: vi.fn(),
    setServedQuestionIds: vi.fn(),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

type SubmitCall = [
  string,
  string,
  (number | undefined)?,
  ({ locale?: string } | undefined)?,
];

/** Last `commitRecordingTake` input, typed — the mock's tuple is untyped. */
function lastCommit(): { questionId: string; locale?: string } {
  const call = mockCommitRecording.mock.calls.at(-1);
  if (!call) throw new Error('commitRecordingTake was never called');
  return call[0] as { questionId: string; locale?: string };
}

/** Last `submitAnswer` call, typed — the mock's tuple is untyped. */
function lastSubmit(): SubmitCall {
  const call = mockSubmit.mock.calls.at(-1);
  if (!call) throw new Error('submitAnswer was never called');
  return call as SubmitCall;
}

// D28 switches the shell to Spanish for an `es` student, so the chrome is Spanish.
const ENGLISH_LABEL = /^(English|Inglés)$/;
const READ_QUESTION = /^(Read question|Leer pregunta)$/;
const englishToggle = () => screen.getByRole('button', { name: ENGLISH_LABEL });

function mintUser(uid: string) {
  return {
    uid,
    isAnonymous: false,
    getIdTokenResult: () => Promise.resolve({ claims: { studentRole: true } }),
  };
}

const QUESTIONS: QuizPublicQuestion[] = [
  {
    id: 'q1',
    type: 'MC',
    text: 'Capital of France?',
    timeLimit: 0,
    choices: ['Paris', 'London', 'Rome'],
    localized: {
      es: {
        text: '¿Capital de Francia?',
        choices: ['París', 'Londres', 'Roma'],
      },
    },
  },
  // No `localized`: the per-question English fallback (§4.6).
  {
    id: 'q2',
    type: 'MC',
    text: 'Color of the sky?',
    timeLimit: 0,
    choices: ['Blue', 'Green'],
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

function setPointer(override: StudentOverride | undefined): void {
  pointerState.current = override
    ? {
        kind: 'quiz',
        sessionId: 'session-1',
        teacherUid: 'teacher-1',
        classId: 'class-1',
        override,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.session = buildSession();
  hookState.myResponse = buildResponse();
  pointerState.current = null;
  mockAuth.currentUser = mintUser('sso-uid-1');
  mockJoinQuizSession.mockResolvedValue('session-1');
  mockSubmit.mockResolvedValue(undefined);
  mockCommitRecording.mockResolvedValue(null);
  window.history.replaceState({}, '', '/quiz?code=ABC123');
  localStorage.clear();
});

describe('QuizStudentApp — translation serving', () => {
  it('renders the localized stem and choices for the accommodation language', async () => {
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('¿Capital de Francia?')).toBeInTheDocument()
    );
    expect(screen.getByText('París')).toBeInTheDocument();
    expect(screen.queryByText('Capital of France?')).not.toBeInTheDocument();
  });

  it('applies the language when the pointer arrives after the question renders', async () => {
    pointerState.current = undefined;
    const { rerender } = render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Capital of France?')).toBeInTheDocument()
    );

    setPointer({ language: 'es' });
    rerender(<QuizStudentApp />);

    await waitFor(() =>
      expect(screen.getByText('¿Capital de Francia?')).toBeInTheDocument()
    );
    expect(englishToggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows one segmented toggle that swaps the rendering back to English', async () => {
    const user = userEvent.setup();
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('¿Capital de Francia?')).toBeInTheDocument()
    );

    const english = englishToggle();
    expect(english).toHaveAttribute('aria-pressed', 'false');
    await user.click(english);

    expect(screen.getByText('Capital of France?')).toBeInTheDocument();
    expect(englishToggle()).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back to English on a question with no translation, with no toggle', async () => {
    setPointer({ language: 'es' });
    hookState.session = buildSession({ publicQuestions: [QUESTIONS[1]] });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Color of the sky?')).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: ENGLISH_LABEL })
    ).not.toBeInTheDocument();
  });

  it('renders English and no toggle when the override carries no language', async () => {
    setPointer({ timeMultiplier: 1.5 });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Capital of France?')).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: ENGLISH_LABEL })
    ).not.toBeInTheDocument();
  });

  it('renders English for a PIN joiner with no pointer doc at all', async () => {
    setPointer(undefined);
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Capital of France?')).toBeInTheDocument()
    );
    expect(screen.queryByText('¿Capital de Francia?')).not.toBeInTheDocument();
  });

  it('writes the English canonical value and stamps `locale` per call', async () => {
    const user = userEvent.setup();
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() => expect(screen.getByText('París')).toBeInTheDocument());

    await user.click(screen.getByText('París'));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    const [, answer, , opts] = lastSubmit();
    expect(answer).toBe('Paris');
    expect(opts?.locale).toBe('es');
  });

  it('drops `locale` once the student re-answers in English', async () => {
    const user = userEvent.setup();
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() => expect(screen.getByText('París')).toBeInTheDocument());
    await user.click(screen.getByText('París'));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());

    await user.click(englishToggle());
    mockSubmit.mockClear();
    await user.click(screen.getByText('London'));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());

    const [, answer, , opts] = lastSubmit();
    expect(answer).toBe('London');
    expect(opts?.locale).toBeUndefined();
  });

  it('keeps the selection across a locale toggle (English cache rehydrates)', async () => {
    const user = userEvent.setup();
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() => expect(screen.getByText('París')).toBeInTheDocument());
    await user.click(screen.getByText('París'));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    const [, answer] = lastSubmit();
    expect(answer).toBe('Paris');

    await user.click(englishToggle());
    // The English rendering shows the same pick, still highlighted.
    const paris = screen.getByText('Paris');
    expect(paris).toBeInTheDocument();
    expect(paris.className).toContain('border-brand-blue-primary');
  });

  it('leaves `spart_language` untouched after a Spanish session (D34)', async () => {
    localStorage.setItem('spart_language', 'en');
    setPointer({ language: 'es' });
    const { unmount } = render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('¿Capital de Francia?')).toBeInTheDocument()
    );
    expect(localStorage.getItem('spart_language')).toBe('en');
    unmount();
    await waitFor(() =>
      expect(localStorage.getItem('spart_language')).toBe('en')
    );
  });
});

describe('QuizStudentApp — Matching placements across a locale toggle', () => {
  const MATCHING: QuizPublicQuestion = {
    id: 'qm',
    type: 'Matching',
    text: 'Match the capitals',
    timeLimit: 0,
    matchingLeft: ['France', 'Germany'],
    matchingRight: ['Paris', 'Berlin'],
    localized: {
      es: {
        text: 'Une las capitales',
        matchingLeft: ['Francia', 'Alemania'],
        matchingRight: ['París', 'Berlín'],
      },
    },
  };

  beforeEach(() => {
    hookState.session = buildSession({
      publicQuestions: [MATCHING],
      totalQuestions: 1,
      shuffleAnswerOptions: false,
    });
  });

  it('keeps a placement made in the target language after toggling to English', async () => {
    const user = userEvent.setup();
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Une las capitales')).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /París/ }));
    await user.click(screen.getByRole('button', { name: /Francia/ }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /París.*Francia/ })
      ).toBeInTheDocument()
    );
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    // The English canonical pair is what reaches Firestore.
    const [, answer] = lastSubmit();
    expect(answer).toContain('France:Paris');

    await user.click(englishToggle());
    // Remounted in English and rehydrated from the same English cache value.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Paris.*France/ })
      ).toBeInTheDocument()
    );
  });
});

describe('QuizStudentApp — read-aloud x translation (D25)', () => {
  beforeEach(() => {
    hookState.session = buildSession({
      readAloudAll: true,
      language: 'en-US',
    });
  });

  it('suppresses the read-aloud controls while a question renders localized', async () => {
    setPointer({ language: 'es', readAloud: true });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('¿Capital de Francia?')).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: READ_QUESTION })
    ).not.toBeInTheDocument();
  });

  it('restores them on the English toggle', async () => {
    const user = userEvent.setup();
    setPointer({ language: 'es', readAloud: true });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('¿Capital de Francia?')).toBeInTheDocument()
    );
    await user.click(englishToggle());
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: READ_QUESTION })
      ).toBeInTheDocument()
    );
  });
});

describe('QuizStudentApp — FIB translation (PR4)', () => {
  const FIB: QuizPublicQuestion = {
    id: 'qf',
    type: 'FIB',
    text: 'The capital of France is ____.',
    timeLimit: 0,
    localized: { es: { text: 'La capital de Francia es ____.' } },
  };

  it('renders the localized stem with its blanks intact', async () => {
    hookState.session = buildSession({
      publicQuestions: [FIB],
      totalQuestions: 1,
    });
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(
        screen.getByText('La capital de Francia es ____.')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('The capital of France is ____.')
    ).not.toBeInTheDocument();
  });

  it('falls back to English when the locale has no FIB entry', async () => {
    hookState.session = buildSession({
      publicQuestions: [{ ...FIB, localized: undefined }],
      totalQuestions: 1,
    });
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(
        screen.getByText('The capital of France is ____.')
      ).toBeInTheDocument()
    );
  });
});

describe('QuizStudentApp — localized quiz title', () => {
  it('shows the localized title in the waiting room', async () => {
    hookState.session = buildSession({
      status: 'waiting',
      quizTitleLocalized: { es: 'Examen de prueba' },
    });
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Examen de prueba')).toBeInTheDocument()
    );
    expect(screen.queryByText('Test quiz')).not.toBeInTheDocument();
  });

  it('falls back to the English title when the locale has none', async () => {
    hookState.session = buildSession({ status: 'waiting' });
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Test quiz')).toBeInTheDocument()
    );
  });
});

describe('QuizStudentApp — recording takes carry the rendering locale', () => {
  const SPOKEN: QuizPublicQuestion = {
    id: 'qr',
    type: 'free-response',
    text: 'Describe Paris.',
    timeLimit: 0,
    recording: {
      prepSeconds: 0,
      limitSeconds: 60,
      prepExpiry: 'auto-start',
      takeLimit: 3,
    },
    localized: { es: { text: 'Describe París.' } },
  } as QuizPublicQuestion;

  beforeEach(() => {
    hookState.session = buildSession({
      publicQuestions: [SPOKEN],
      totalQuestions: 1,
      mediaResponseEnabled: true,
    });
    hookState.myResponse = buildResponse({ _responseKey: 'resp-1' });
  });

  it('stamps `locale` on a take committed from the localized rendering', async () => {
    const user = userEvent.setup();
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Describe París.')).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'commit-take' }));
    await waitFor(() => expect(mockCommitRecording).toHaveBeenCalled());
    expect(lastCommit()).toMatchObject({ questionId: 'qr', locale: 'es' });
  });

  it('omits `locale` once the student toggles to English', async () => {
    const user = userEvent.setup();
    setPointer({ language: 'es' });
    render(<QuizStudentApp />);
    await waitFor(() =>
      expect(screen.getByText('Describe París.')).toBeInTheDocument()
    );
    await user.click(englishToggle());
    await user.click(screen.getByRole('button', { name: 'commit-take' }));
    await waitFor(() => expect(mockCommitRecording).toHaveBeenCalled());
    expect(lastCommit()).not.toHaveProperty('locale');
  });
});

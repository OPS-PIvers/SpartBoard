/**
 * Coverage for the teacher-configurable "Block Copy & Paste" quiz setting
 * (session.blockCopyPaste). When enabled, the student quiz-taking surface
 * (question prompt + answer fields) suppresses copy / cut / paste so a
 * student can't paste a block of text composed in another tab. When off
 * (default), the clipboard works normally.
 *
 * The harness mirrors QuizStudentApp.selfPaced.test.tsx: a stateful
 * `useQuizSessionStudent` mock drives the active-question render, and an
 * SSO user auto-joins so the answer field mounts.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizSession, QuizResponse, QuizPublicQuestion } from '@/types';

const { mockAuth, mockJoinQuizSession, mockLookupSession, hookState } =
  vi.hoisted(() => {
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
      mockLookupSession: vi.fn(),
      hookState: state,
    };
  });

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
    lookupSession: mockLookupSession,
    joinQuizSession: mockJoinQuizSession,
    submitAnswer: vi.fn(),
    completeQuiz: vi.fn(),
    reportTabSwitch: vi.fn(),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

const FIB_QUESTION: QuizPublicQuestion = {
  id: 'q1',
  type: 'FIB',
  text: 'The capital of France is ____',
  timeLimit: 0,
};

const SHORT_QUESTION: QuizPublicQuestion = {
  id: 'q1',
  type: 'short',
  text: 'Explain why the sky is blue.',
  timeLimit: 0,
};

// jsdom does not implement document.execCommand; install a stub the editor's
// paste handler can call (and we can assert against) to distinguish "blocked"
// (no insert) from "allowed" (plain-text insert).
type ExecHost = { execCommand?: unknown };
const withExecStub = async (
  run: (exec: ReturnType<typeof vi.fn>) => Promise<void>
): Promise<void> => {
  const exec = vi.fn();
  const prev = (document as ExecHost).execCommand;
  (document as ExecHost).execCommand = exec;
  try {
    await run(exec);
  } finally {
    (document as ExecHost).execCommand = prev;
  }
};

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
    totalQuestions: 1,
    publicQuestions: [FIB_QUESTION],
    ...overrides,
  };
}

function buildResponse(): QuizResponse {
  return {
    studentUid: 'sso-uid-1',
    joinedAt: Date.now(),
    status: 'in-progress',
    answers: [],
    score: null,
    submittedAt: null,
    completedAttempts: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.myResponse = buildResponse();
  mockAuth.currentUser = {
    uid: 'sso-uid-1',
    isAnonymous: false,
    getIdTokenResult: () => Promise.resolve({ claims: { studentRole: true } }),
  };
  mockJoinQuizSession.mockResolvedValue('session-1');
  window.history.replaceState({}, '', '/quiz?code=ABC123');
});

const getFibInput = async (): Promise<HTMLElement> => {
  await screen.findByText(/capital of france/i);
  return screen.getByPlaceholderText(/type your answer/i);
};

describe('QuizStudentApp — Block Copy & Paste', () => {
  it('blocks paste, cut, and drop on the answer field when blockCopyPaste is on', async () => {
    hookState.session = buildSession({ blockCopyPaste: true });
    render(<QuizStudentApp />);
    const input = await getFibInput();
    // fireEvent returns false when the event's default action was prevented.
    expect(
      fireEvent.paste(input, { clipboardData: { getData: () => 'Paris' } })
    ).toBe(false);
    expect(fireEvent.cut(input)).toBe(false);
    // Drag-and-drop is the other channel for importing externally-composed
    // text — the container guard blocks it too.
    expect(
      fireEvent.drop(input, { dataTransfer: { getData: () => 'Paris' } })
    ).toBe(false);
  });

  it('blocks paste into the short/essay editor when blockCopyPaste is on (prop wiring)', async () => {
    await withExecStub(async (exec) => {
      hookState.session = buildSession({
        blockCopyPaste: true,
        publicQuestions: [SHORT_QUESTION],
      });
      render(<QuizStudentApp />);
      // The editor is lazy-loaded; wait for the contenteditable to mount.
      const editor = await screen.findByRole('textbox', {
        name: /your response/i,
      });
      fireEvent.paste(editor, {
        clipboardData: { getData: () => 'pasted essay' },
      });
      // If `blockClipboard` weren't threaded to the editor, its handler would
      // insert the plain text via execCommand — assert it never does.
      expect(exec).not.toHaveBeenCalled();
    });
  });

  it('still inserts pasted text into the short/essay editor when blockCopyPaste is off', async () => {
    await withExecStub(async (exec) => {
      hookState.session = buildSession({ publicQuestions: [SHORT_QUESTION] });
      render(<QuizStudentApp />);
      const editor = await screen.findByRole('textbox', {
        name: /your response/i,
      });
      fireEvent.paste(editor, {
        clipboardData: { getData: () => 'pasted essay' },
      });
      expect(exec).toHaveBeenCalledWith('insertText', false, 'pasted essay');
    });
  });

  it('blocks copy from the question prompt when blockCopyPaste is on', async () => {
    hookState.session = buildSession({ blockCopyPaste: true });
    render(<QuizStudentApp />);
    const prompt = await screen.findByText(/capital of france/i);
    expect(fireEvent.copy(prompt)).toBe(false);
  });

  it('allows paste and copy when blockCopyPaste is off (default)', async () => {
    hookState.session = buildSession(); // blockCopyPaste undefined
    render(<QuizStudentApp />);
    const input = await getFibInput();
    const pastePrevented = fireEvent.paste(input, {
      clipboardData: { getData: () => 'Paris' },
    });
    expect(pastePrevented).toBe(true);
    expect(
      fireEvent.drop(input, { dataTransfer: { getData: () => 'Paris' } })
    ).toBe(true);
    const prompt = screen.getByText(/capital of france/i);
    expect(fireEvent.copy(prompt)).toBe(true);
  });
});

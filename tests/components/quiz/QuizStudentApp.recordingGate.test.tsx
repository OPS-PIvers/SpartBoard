/**
 * The media gate reaches `/quiz` — a route with no AuthProvider — only as
 * `session.mediaResponseEnabled`. A question that still carries a `recording`
 * block on a session without the marker must fall back to its ordinary
 * answer UI rather than mounting capture.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizSession, QuizResponse, QuizPublicQuestion } from '@/types';

const { mockAuth, hookState, spies } = vi.hoisted(() => ({
  spies: {
    completeQuiz: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(true),
  },
  mockAuth: {
    onAuthStateChanged: vi.fn(),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: {
      uid: 'sso-uid-1',
      isAnonymous: false,
      getIdTokenResult: () =>
        Promise.resolve({ claims: { studentRole: true } }),
    } as unknown,
  },
  hookState: {
    session: null as QuizSession | null,
    myResponse: null as QuizResponse | null,
  },
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: spies.showConfirm,
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => null,
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
    joinQuizSession: vi.fn().mockResolvedValue('session-1'),
    submitAnswer: vi.fn().mockResolvedValue(undefined),
    commitRecordingTake: vi.fn().mockResolvedValue(1),
    setArtifactUploadState: vi.fn().mockResolvedValue(undefined),
    markUnresponded: vi.fn().mockResolvedValue(undefined),
    acknowledgeRecordingNotice: vi.fn().mockResolvedValue(undefined),
    completeQuiz: spies.completeQuiz,
    reportTabSwitch: vi.fn(),
    setHandRaised: vi.fn(),
    recordStimulusPlay: vi.fn(),
    reportStimulusError: vi.fn(),
    setServedQuestionIds: vi.fn(),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

const RECORDING_BLOCK: NonNullable<QuizPublicQuestion['recording']> = {
  prepSeconds: 30,
  limitSeconds: 60,
  prepExpiry: 'armed',
  takeLimit: null,
};

const RECORDING_QUESTION: QuizPublicQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Say it out loud',
  timeLimit: 0,
  choices: ['Alpha', 'Bravo'],
  recording: RECORDING_BLOCK,
};

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
    publicQuestions: [RECORDING_QUESTION],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  spies.showConfirm.mockResolvedValue(true);
  hookState.myResponse = buildResponse();
  window.history.replaceState({}, '', '/quiz?code=ABC123');
});

describe('QuizStudentApp — recording gate', () => {
  it('renders the ordinary answer UI when the session carries no marker', async () => {
    hookState.session = buildSession();
    render(<QuizStudentApp />);

    expect(await screen.findByText(/Say it out loud/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.queryByText(/Before you record/i)).not.toBeInTheDocument();
  });

  it('locks the recorder once prep expiry closed the slot', async () => {
    hookState.session = buildSession({
      mediaResponseEnabled: true,
      sessionMode: 'teacher',
      publicQuestions: [
        {
          ...RECORDING_QUESTION,
          recording: { ...RECORDING_BLOCK, prepExpiry: 'unanswered' },
        },
      ],
    });
    hookState.myResponse = buildResponse({
      recordingNoticeAckedAt: 1700000000000,
      answers: [
        {
          questionId: 'q1',
          answer: '',
          answeredAt: 1700000001000,
          status: 'submitted',
          unresponded: 'expired',
        },
      ],
    });
    render(<QuizStudentApp />);

    expect(
      await screen.findByText(/Recording time is over/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Record/i })
    ).not.toBeInTheDocument();
  });

  it('skips the notice when the response already carries the ack', async () => {
    hookState.session = buildSession({ mediaResponseEnabled: true });
    hookState.myResponse = buildResponse({
      recordingNoticeAckedAt: 1700000000000,
    });
    render(<QuizStudentApp />);

    expect(await screen.findByText(/Thinking time/i)).toBeInTheDocument();
    expect(screen.queryByText(/Before you record/i)).not.toBeInTheDocument();
  });

  it('treats an unrecorded question as unanswered at submit', async () => {
    hookState.session = buildSession({ mediaResponseEnabled: true });
    hookState.myResponse = buildResponse({
      recordingNoticeAckedAt: 1700000000000,
    });
    render(<QuizStudentApp />);

    fireEvent.click(await screen.findByRole('button', { name: 'Submit quiz' }));

    await waitFor(() => expect(spies.showConfirm).toHaveBeenCalledTimes(1));
    expect(spies.showConfirm.mock.calls[0][0]).toMatch(
      /1 question still has no answer/i
    );
    await waitFor(() => expect(spies.completeQuiz).toHaveBeenCalledTimes(1));
  });

  it('keeps the student on the quiz when they choose to keep working', async () => {
    spies.showConfirm.mockResolvedValue(false);
    hookState.session = buildSession({ mediaResponseEnabled: true });
    hookState.myResponse = buildResponse({
      recordingNoticeAckedAt: 1700000000000,
    });
    render(<QuizStudentApp />);

    fireEvent.click(await screen.findByRole('button', { name: 'Submit quiz' }));

    await waitFor(() => expect(spies.showConfirm).toHaveBeenCalledTimes(1));
    expect(spies.completeQuiz).not.toHaveBeenCalled();
  });

  it('does not warn when a dead microphone already resolved the slot', async () => {
    hookState.session = buildSession({ mediaResponseEnabled: true });
    hookState.myResponse = buildResponse({
      recordingNoticeAckedAt: 1700000000000,
      answers: [
        {
          questionId: 'q1',
          answer: '',
          answeredAt: 1700000001000,
          status: 'submitted',
          unresponded: 'capture-unavailable',
        },
      ],
    });
    render(<QuizStudentApp />);

    fireEvent.click(await screen.findByRole('button', { name: 'Submit quiz' }));

    await waitFor(() => expect(spies.completeQuiz).toHaveBeenCalledTimes(1));
    expect(spies.showConfirm).not.toHaveBeenCalled();
  });

  it('mounts capture when the session carries the marker', async () => {
    hookState.session = buildSession({ mediaResponseEnabled: true });
    render(<QuizStudentApp />);

    expect(await screen.findByText(/Before you record/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Alpha' })
    ).not.toBeInTheDocument();
  });
});

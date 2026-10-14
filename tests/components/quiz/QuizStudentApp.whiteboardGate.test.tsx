/**
 * Whiteboard capture reaches `/quiz` only through `session.whiteboardResponseEnabled`;
 * without it a whiteboard question degrades like an ungated spoken one.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizSession, QuizResponse, QuizPublicQuestion } from '@/types';

const { mockAuth, hookState, spies } = vi.hoisted(() => ({
  spies: {
    completeQuiz: vi.fn().mockResolvedValue(undefined),
    markUnresponded: vi.fn().mockResolvedValue(undefined),
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
    },
  },
  hookState: {
    session: null as QuizSession | null,
    myResponse: null as QuizResponse | null,
  },
}));

vi.mock('@/hooks/useQuizRecordingNoticeSettings', () => ({
  useQuizRecordingNoticeSettings: () => ({
    settings: { enabled: true },
    loaded: true,
  }),
}));

// The pre-quiz mic check has its own suite; these tests start past it.
vi.mock('@/components/quiz/recording/MicrophoneGate', async () => {
  const { useEffect } = await import('react');
  return {
    MicrophoneGate: ({ onReady }: { onReady: () => void }) => {
      useEffect(onReady, [onReady]);
      return null;
    },
  };
});

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
    markUnresponded: spies.markUnresponded,
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
import { isRecordingSlotClosed } from '@/utils/answerTakeOrdering';

const WHITEBOARD_QUESTION: QuizPublicQuestion = {
  id: 'q1',
  type: 'free-response',
  text: 'Show your work',
  timeLimit: 0,
  stimulusIds: ['stim-1'],
  recording: {
    mode: 'whiteboard',
    prepSeconds: 0,
    limitSeconds: 180,
    prepExpiry: 'armed',
    takeLimit: null,
  },
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
    recordingNoticeAckedAt: 1700000000000,
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
    mediaResponseEnabled: true,
    stimuli: [
      {
        id: 'stim-1',
        type: 'text',
        url: '',
        label: 'Table',
        text: 'A table of two points.',
      },
    ],
    publicQuestions: [WHITEBOARD_QUESTION],
    ...overrides,
  };
}

const setPortrait = (portrait: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === '(orientation: portrait)' ? portrait : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  hookState.myResponse = buildResponse();
  setPortrait(false);
  window.history.replaceState({}, '', '/quiz?code=ABC123');
});

describe('QuizStudentApp — whiteboard gate', () => {
  it('falls back to a typed answer when the session lacks the whiteboard marker', async () => {
    hookState.session = buildSession();
    render(<QuizStudentApp />);

    expect(await screen.findByText(/Show your work/i)).toBeInTheDocument();
    expect((await screen.findAllByRole('textbox')).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Show materials' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('A table of two points.')).toBeInTheDocument();
  });

  it('moves the stimulus into a drawer when the marker is on', async () => {
    hookState.session = buildSession({ whiteboardResponseEnabled: true });
    render(<QuizStudentApp />);

    const toggle = await screen.findByRole('button', {
      name: 'Show materials',
    });
    const drawer = screen.getByRole('complementary', { hidden: true });
    expect(drawer).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(toggle);
    expect(drawer).toHaveAttribute('aria-hidden', 'false');
    expect(
      screen.getAllByRole('button', { name: 'Hide materials' }).length
    ).toBeGreaterThan(0);
  });

  it('gates portrait screens and records device-gated on an empty slot', async () => {
    setPortrait(true);
    hookState.session = buildSession({ whiteboardResponseEnabled: true });
    render(<QuizStudentApp />);

    expect(
      await screen.findByText('Turn your device sideways')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(spies.markUnresponded).toHaveBeenCalledWith('q1', 'device-gated')
    );
  });

  it('keeps the whiteboard mounted under the portrait gate', async () => {
    setPortrait(true);
    hookState.session = buildSession({ whiteboardResponseEnabled: true });
    const { container } = render(<QuizStudentApp />);

    await screen.findByText('Turn your device sideways');
    const inert = container.querySelector('[inert]');
    expect(inert).not.toBeNull();
    expect(inert?.childElementCount).toBeGreaterThan(0);
  });

  it('keeps the slot open after rotating back from a device-gated marker', async () => {
    hookState.session = buildSession({ whiteboardResponseEnabled: true });
    hookState.myResponse = buildResponse({
      answers: [
        {
          questionId: 'q1',
          answer: '',
          answeredAt: 1700000001000,
          status: 'submitted',
          unresponded: 'device-gated',
        },
      ],
    });
    render(<QuizStudentApp />);

    expect(
      await screen.findByRole('button', { name: 'Show materials' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Turn your device sideways')
    ).not.toBeInTheDocument();
    expect(isRecordingSlotClosed(hookState.myResponse.answers, 'q1')).toBe(
      false
    );
  });

  it('leaves an answered slot alone in portrait', async () => {
    setPortrait(true);
    hookState.session = buildSession({ whiteboardResponseEnabled: true });
    hookState.myResponse = buildResponse({
      answers: [
        {
          questionId: 'q1',
          answer: '',
          answeredAt: 1700000001000,
          status: 'submitted',
          takeIndex: 1,
          artifacts: [
            {
              id: 'pic-1',
              slot: 'primary',
              kind: 'whiteboard',
              part: 'picture',
              storagePath: 'p',
              uploadState: 'uploaded',
              mimeType: 'image/png',
            },
          ],
        },
      ],
    });
    render(<QuizStudentApp />);

    expect(
      await screen.findByText('Turn your device sideways')
    ).toBeInTheDocument();
    expect(spies.markUnresponded).not.toHaveBeenCalled();
  });
});

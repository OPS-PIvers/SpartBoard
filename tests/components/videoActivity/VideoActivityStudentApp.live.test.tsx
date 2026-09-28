// Teacher-paced VA: the student view renders purely from the session's live state and their own answers.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  VideoActivityLiveState,
  VideoActivityPublicQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';

const { mockAuth, hookState, spies } = vi.hoisted(() => ({
  mockAuth: {
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: {
      uid: 'sso-uid-1',
      isAnonymous: false,
      getIdTokenResult: () =>
        Promise.resolve({ claims: { studentRole: true, classIds: ['A'] } }),
    } as unknown,
  },
  hookState: {
    session: null as import('@/types').VideoActivitySession | null,
    myResponse: null as import('@/types').VideoActivityResponse | null,
  },
  spies: {
    checkAnswer: vi.fn(),
    submitAnswer: vi.fn(),
    completeActivity: vi.fn(),
    reportTabSwitch: vi.fn(),
  },
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

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => null,
}));

vi.mock('@/hooks/useVideoActivitySession', () => ({
  useVideoActivitySessionStudent: () => ({
    session: hookState.session,
    myResponse: hookState.myResponse,
    joinStatus: 'joined',
    error: null,
    lookupSession: vi.fn(),
    joinSession: vi.fn(),
    submitAnswer: spies.submitAnswer,
    checkAnswer: spies.checkAnswer,
    completeActivity: spies.completeActivity,
    reportTabSwitch: spies.reportTabSwitch,
    saveTabExits: vi.fn(() => Promise.resolve()),
    periodKeys: [],
    contentPending: false,
    retakePending: false,
  }),
}));

vi.mock('@/components/videoActivity/VideoPlayer', () => ({
  VideoPlayer: () => React.createElement('div', { 'data-testid': 'va-player' }),
}));

import { VideoActivityStudentApp } from '@/components/videoActivity/VideoActivityStudentApp';

const QUESTIONS = [
  {
    id: 'q1',
    timestamp: 5,
    text: 'Pick one',
    type: 'MC',
    options: ['Red', 'Blue'],
  },
  { id: 'q2', timestamp: 10, text: 'Name it', type: 'FIB' },
  {
    id: 'q3',
    timestamp: 20,
    text: 'Pick all',
    type: 'MA',
    options: ['X', 'Y', 'Z'],
  },
] as VideoActivityPublicQuestion[];

const live = (
  over: Partial<VideoActivityLiveState> = {}
): VideoActivityLiveState => ({
  currentQuestionId: null,
  questionPhase: 'closed',
  resultsShown: false,
  answerRevealed: false,
  askedQuestionIds: [],
  skippedQuestionIds: [],
  playheadSeconds: 0,
  updatedAt: 1,
  ...over,
});

function buildSession(
  over: Partial<VideoActivitySession> = {}
): VideoActivitySession {
  return {
    id: 'session-1',
    activityId: 'act-1',
    activityTitle: 'Mitosis clip',
    teacherUid: 't1',
    youtubeUrl: 'https://youtu.be/abc',
    questions: [],
    publicQuestions: QUESTIONS,
    status: 'active',
    sessionMode: 'teacher',
    live: live(),
    allowedPins: [],
    createdAt: 1,
    sessionOptions: { tabWarningsEnabled: false, attemptLimit: 1 },
    ...over,
  } as VideoActivitySession;
}

function buildResponse(
  over: Partial<VideoActivityResponse> = {}
): VideoActivityResponse {
  return {
    studentUid: 'sso-uid-1',
    joinedAt: 1,
    answers: [],
    completedAt: null,
    score: null,
    completedAttempts: 0,
    tabSwitchWarnings: 0,
    ...over,
  };
}

const openQ = (id: string, extra: Partial<VideoActivityLiveState> = {}) =>
  buildSession({
    live: live({
      currentQuestionId: id,
      questionPhase: 'open',
      askedQuestionIds: [id],
      ...extra,
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  spies.completeActivity.mockResolvedValue(undefined);
  spies.submitAnswer.mockResolvedValue(undefined);
  hookState.session = buildSession();
  hookState.myResponse = buildResponse();
  window.history.replaceState({}, '', '/activity/session-1');
});

describe('VideoActivityStudentApp: teacher-paced', () => {
  it('shows the lobby while the session waits', async () => {
    hookState.session = buildSession({ status: 'waiting' });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText("You're in.")).toBeInTheDocument();
    expect(
      screen.getByText('Waiting for your teacher to start.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('va-player')).toBeNull();
  });

  it('tells the student to watch the board between questions', async () => {
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Watch the board.')).toBeInTheDocument();
    expect(screen.queryByTestId('va-player')).toBeNull();
  });

  it('checks an MC answer before writing it, then locks it', async () => {
    hookState.session = openQ('q1');
    spies.checkAnswer.mockResolvedValue({
      isCorrect: true,
      correctAnswer: 'Blue',
    });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Pick one')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Blue'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await Promise.resolve();
    });
    expect(spies.checkAnswer).toHaveBeenCalledWith('q1', 'Blue');
    expect(spies.submitAnswer).toHaveBeenCalledWith('q1', 'Blue', true);
    expect(
      await screen.findByText('Submitted, eyes on the board')
    ).toBeInTheDocument();
    // No verdict before the teacher reveals.
    expect(screen.queryByText('Correct')).toBeNull();
  });

  it('does not write when the check fails, and lets the student retry', async () => {
    hookState.session = openQ('q2');
    spies.checkAnswer.mockRejectedValue(new Error('offline'));
    render(<VideoActivityStudentApp />);
    fireEvent.change(await screen.findByPlaceholderText('Type your answer…'), {
      target: { value: 'cell' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await Promise.resolve();
    });
    expect(spies.submitAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't send your answer. Try again."
    );
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  it('maps the question-closed refusal to "Question closed"', async () => {
    hookState.session = openQ('q3');
    spies.checkAnswer.mockRejectedValue(
      Object.assign(new Error('Question closed.'), {
        code: 'functions/failed-precondition',
        details: { reason: 'question-closed' },
      })
    );
    render(<VideoActivityStudentApp />);
    fireEvent.click(await screen.findByText('Y'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await Promise.resolve();
    });
    expect(spies.checkAnswer).toHaveBeenCalledWith('q3', 'Y');
    expect(spies.submitAnswer).not.toHaveBeenCalled();
    expect(await screen.findByText('Question closed')).toBeInTheDocument();
  });

  it('shows the locked answer after a refresh on an open question', async () => {
    hookState.session = openQ('q2');
    hookState.myResponse = buildResponse({
      answers: [{ questionId: 'q2', answer: 'nucleus', answeredAt: 2 }],
    });
    render(<VideoActivityStudentApp />);
    expect(
      await screen.findByText('Submitted, eyes on the board')
    ).toBeInTheDocument();
    const input = screen.getByDisplayValue('nucleus');
    expect(input).toBeDisabled();
  });

  it('shows "Question closed" for a missed question before the reveal', async () => {
    hookState.session = buildSession({
      live: live({ currentQuestionId: 'q1', askedQuestionIds: ['q1'] }),
    });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Question closed')).toBeInTheDocument();
  });

  it('flips to incorrect on reveal from the recorded verdict', async () => {
    hookState.session = openQ('q1', { answerRevealed: true });
    hookState.myResponse = buildResponse({
      answers: [
        { questionId: 'q1', answer: 'Red', answeredAt: 2, isCorrect: false },
      ],
    });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByText('Red').closest('button')).toBeDisabled();
  });

  it('flips to correct on reveal from this tab’s check', async () => {
    hookState.session = openQ('q1');
    spies.checkAnswer.mockResolvedValue({
      isCorrect: true,
      correctAnswer: 'Blue',
    });
    const { rerender } = render(<VideoActivityStudentApp />);
    fireEvent.click(await screen.findByText('Blue'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await Promise.resolve();
    });
    hookState.session = openQ('q1', { answerRevealed: true });
    rerender(<VideoActivityStudentApp />);
    expect(await screen.findByText('Correct')).toBeInTheDocument();
  });

  it('tells a student who missed a revealed question', async () => {
    hookState.session = buildSession({
      live: live({
        currentQuestionId: 'q1',
        askedQuestionIds: ['q1'],
        answerRevealed: true,
      }),
    });
    render(<VideoActivityStudentApp />);
    expect(
      await screen.findByText("You didn't answer this one")
    ).toBeInTheDocument();
  });

  it('marks the revealed key on the board answer, not the check result', async () => {
    hookState.session = openQ('q1', {
      answerRevealed: true,
      revealedAnswer: 'Blue',
    });
    hookState.myResponse = buildResponse({
      answers: [
        { questionId: 'q1', answer: 'Red', answeredAt: 2, isCorrect: false },
      ],
    });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByText('Blue').closest('button')).toHaveClass(
      'bg-emerald-50'
    );
    expect(screen.getByText('Red').closest('button')).toHaveClass('bg-red-50');
  });

  it('shows no key until the teacher reveals it', async () => {
    hookState.session = openQ('q1', { revealedAnswer: 'Blue' });
    hookState.myResponse = buildResponse({
      answers: [
        { questionId: 'q1', answer: 'Red', answeredAt: 2, isCorrect: false },
      ],
    });
    render(<VideoActivityStudentApp />);
    expect(
      await screen.findByText('Submitted, eyes on the board')
    ).toBeInTheDocument();
    expect(screen.getByText('Blue').closest('button')).not.toHaveClass(
      'bg-emerald-50'
    );
  });

  it('shows the revealed key to a student who missed a choose-all question', async () => {
    hookState.session = buildSession({
      live: live({
        currentQuestionId: 'q3',
        askedQuestionIds: ['q3'],
        answerRevealed: true,
        revealedAnswer: 'X|Z',
      }),
    });
    render(<VideoActivityStudentApp />);
    expect(
      await screen.findByText("You didn't answer this one")
    ).toBeInTheDocument();
    expect(screen.getByText('X').closest('button')).toHaveClass(
      'bg-emerald-50/60'
    );
    expect(screen.getByText('Y').closest('button')).not.toHaveClass(
      'bg-emerald-50/60'
    );
  });

  it('shows the revealed fill-in answer to a student who missed it', async () => {
    hookState.session = buildSession({
      live: live({
        currentQuestionId: 'q2',
        askedQuestionIds: ['q2'],
        answerRevealed: true,
        revealedAnswer: 'Mitosis',
      }),
    });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Mitosis')).toBeInTheDocument();
  });

  it('completes once on end and scores over asked questions only', async () => {
    hookState.session = buildSession({
      status: 'ended',
      scoreVisibility: 'score-only',
      live: live({
        askedQuestionIds: ['q1', 'q2'],
        skippedQuestionIds: ['q3'],
      }),
    });
    hookState.myResponse = buildResponse({
      answers: [
        { questionId: 'q1', answer: 'Blue', answeredAt: 2, isCorrect: true },
      ],
    });
    const { rerender } = render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Activity Complete!')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 correct')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    rerender(<VideoActivityStudentApp />);
    await waitFor(() =>
      expect(spies.completeActivity).toHaveBeenCalledTimes(1)
    );
  });

  it('does not re-complete a finished response', async () => {
    hookState.session = buildSession({ status: 'ended' });
    hookState.myResponse = buildResponse({ completedAt: 5 });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Activity Complete!')).toBeInTheDocument();
    expect(spies.completeActivity).not.toHaveBeenCalled();
  });
});

describe('VideoActivityStudentApp: teacher-paced tab warnings', () => {
  it('warns and logs a tab exit but never submits', async () => {
    hookState.session = buildSession({
      sessionOptions: {
        tabWarningsEnabled: true,
        tabWarningThreshold: 1,
        tabAwayLimitSeconds: 5,
        tabAwayAutoSubmit: true,
        attemptLimit: 1,
      },
    });
    spies.reportTabSwitch.mockResolvedValue(1);
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    render(<VideoActivityStudentApp />);
    await screen.findByText('Watch the board.');
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(await screen.findByText('TAB SWITCH DETECTED')).toBeInTheDocument();
    expect(screen.getByText('Warning 1.')).toBeInTheDocument();
    expect(spies.reportTabSwitch).toHaveBeenCalledOnce();
    await new Promise((r) => setTimeout(r, 150));
    expect(spies.completeActivity).not.toHaveBeenCalled();
    focus.mockRestore();
  });
});

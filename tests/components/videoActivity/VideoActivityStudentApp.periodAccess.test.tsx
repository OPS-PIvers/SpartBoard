// Per-period VA sessions: a locked card (no video) until the period opens or the student is
// let in, and a paused overlay over the held player when the period closes mid-activity.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  PeriodAccess,
  VideoActivityPublicQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';

const { mockAuth, hookState } = vi.hoisted(() => ({
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
    contentPending: false,
    retakePending: false,
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
    submitAnswer: vi.fn(),
    checkAnswer: vi.fn(),
    completeActivity: vi.fn(),
    reportTabSwitch: vi.fn(),
    periodKeys: ['A'],
    contentPending: hookState.contentPending,
    retakePending: hookState.retakePending,
  }),
}));

vi.mock('@/components/videoActivity/VideoPlayer', () => ({
  VideoPlayer: (props: { paused?: boolean }) =>
    React.createElement('div', {
      'data-testid': 'va-player',
      'data-paused': String(!!props.paused),
    }),
}));

import { VideoActivityStudentApp } from '@/components/videoActivity/VideoActivityStudentApp';

const QUESTIONS = [
  { id: 'q1', timestamp: 5, text: 'Why?', type: 'MC', options: ['a', 'b'] },
] as VideoActivityPublicQuestion[];

const period = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'open',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P1',
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
    allowedPins: [],
    createdAt: 1,
    sessionOptions: { tabWarningsEnabled: false },
    ...over,
  } as VideoActivitySession;
}

const perPeriod = (
  p: Partial<PeriodAccess>,
  extra: Partial<VideoActivitySession> = {}
) =>
  buildSession({
    accessMode: 'assessment',
    questionsInContent: true,
    periodAccess: { A: period(p), B: period() },
    ...extra,
  });

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
    classId: 'A',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookState.session = buildSession();
  hookState.myResponse = buildResponse();
  hookState.contentPending = false;
  hookState.retakePending = false;
  window.history.replaceState({}, '', '/activity/session-1');
});

const player = () => screen.findByTestId('va-player');

describe('VideoActivityStudentApp — per-period access', () => {
  it('shows a locked card with no video before the period opens', async () => {
    hookState.session = perPeriod({ state: 'closed' });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Not open yet')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByTestId('va-player')).toBeNull();
  });

  it('names the scheduled open time', async () => {
    hookState.session = perPeriod({ openAt: Date.now() + 3_600_000 });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText(/^Opens /)).toBeInTheDocument();
    expect(screen.queryByTestId('va-player')).toBeNull();
  });

  it('tells a student with saved answers their class is paused', async () => {
    hookState.session = perPeriod({ state: 'paused' });
    hookState.myResponse = buildResponse({
      answers: [{ questionId: 'q1', answer: 'a', answeredAt: 2 }],
    });
    render(<VideoActivityStudentApp />);
    expect(
      await screen.findByText('Paused for your class')
    ).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.queryByTestId('va-player')).toBeNull();
  });

  it('shows the locked card, not the completion screen, while a retake waits', async () => {
    hookState.session = perPeriod({ state: 'closed' });
    hookState.myResponse = buildResponse({ completedAt: 5 });
    hookState.retakePending = true;
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Not open yet')).toBeInTheDocument();
    expect(screen.queryByText('Activity Complete!')).toBeNull();
  });

  it('sends a finished student to the done screen even with the period closed', async () => {
    hookState.session = perPeriod({ state: 'closed' });
    hookState.myResponse = buildResponse({ completedAt: 5 });
    hookState.contentPending = true;
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Activity Complete!')).toBeInTheDocument();
    expect(screen.queryByText('Loading activity…')).toBeNull();
  });

  it('plays once the period is open', async () => {
    hookState.session = perPeriod({});
    render(<VideoActivityStudentApp />);
    expect((await player()).dataset.paused).toBe('false');
    expect(screen.queryByText('Not open yet')).toBeNull();
  });

  it('plays for a student let in past a closed period', async () => {
    hookState.session = perPeriod(
      { state: 'closed' },
      { studentAccess: { 'sso-uid-1': Date.now() + 600_000 } }
    );
    render(<VideoActivityStudentApp />);
    expect((await player()).dataset.paused).toBe('false');
  });

  it('waits for the hidden questions to load', async () => {
    hookState.session = perPeriod({});
    hookState.contentPending = true;
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('Loading activity…')).toBeInTheDocument();
    expect(screen.queryByTestId('va-player')).toBeNull();
  });

  it('holds the player under a paused overlay when the period closes mid-activity, then resumes', async () => {
    hookState.session = perPeriod({});
    const { rerender } = render(<VideoActivityStudentApp />);
    await player();

    hookState.session = perPeriod({ state: 'paused' });
    rerender(<VideoActivityStudentApp />);
    await waitFor(() =>
      expect(screen.getByTestId('va-player').dataset.paused).toBe('true')
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your answers are saved'
    );

    hookState.session = perPeriod({});
    rerender(<VideoActivityStudentApp />);
    await waitFor(() =>
      expect(screen.getByTestId('va-player').dataset.paused).toBe('false')
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('leaves legacy sessions ungated', async () => {
    hookState.session = buildSession();
    render(<VideoActivityStudentApp />);
    expect((await player()).dataset.paused).toBe('false');
  });
});

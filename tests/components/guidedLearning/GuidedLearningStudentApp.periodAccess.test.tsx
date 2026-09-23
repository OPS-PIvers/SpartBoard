// Per-period GL sessions: the student is seated on Start, sees a locked card (no slides) until
// their period opens or they are let in, and a paused overlay if it closes mid-activity.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { GuidedLearningSession, PeriodAccess } from '@/types';

const { mockAuth, hookState, takeSeat, submitResponse, progressOpts } =
  vi.hoisted(() => ({
    mockAuth: {
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as unknown,
    },
    hookState: {
      session: null as import('@/types').GuidedLearningSession | null,
      periodKeys: [] as string[],
      contentPending: false,
    },
    takeSeat: vi.fn(),
    submitResponse: vi.fn(),
    progressOpts: vi.fn(),
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
  signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon-uid' } }),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(() => Promise.resolve()),
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  serverTimestamp: vi.fn(),
}));

vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionStudent: () => ({
    session: hookState.session,
    loading: false,
    error: null,
    submitResponse,
    periodKeys: hookState.periodKeys,
    contentPending: hookState.contentPending,
    takeSeat,
  }),
}));

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => undefined,
}));

vi.mock('@/hooks/useGuidedLearningProgress', () => ({
  useGuidedLearningProgress: (opts: unknown) => {
    progressOpts(opts);
    return { onStepEvent: vi.fn() };
  },
}));

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningPlayer',
  () => ({
    GuidedLearningPlayer: () => <div data-testid="gl-player">Player</div>,
  })
);

import { GuidedLearningStudentApp } from '@/components/guidedLearning/GuidedLearningStudentApp';

const period = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'open',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P1',
  ...over,
});

const buildSession = (
  over: Partial<GuidedLearningSession> = {}
): GuidedLearningSession =>
  ({
    id: 'session-1',
    title: 'Cell parts',
    mode: 'guided',
    imageUrls: ['https://img/1.png'],
    publicSteps: [{ id: 's1', xPct: 0, yPct: 0, imageIndex: 0 }],
    teacherUid: 't1',
    createdAt: 1,
    assignmentMode: 'submissions',
    ...over,
  }) as GuidedLearningSession;

const perPeriod = (
  p: Partial<PeriodAccess>,
  extra: Partial<GuidedLearningSession> = {}
) =>
  buildSession({
    accessMode: 'assignment',
    stepsInContent: true,
    periodAccess: { A: period(p), B: period({ label: 'P3' }) },
    ...extra,
  });

function signInSso() {
  mockAuth.currentUser = {
    uid: 'sso-uid-1',
    isAnonymous: false,
    getIdTokenResult: () =>
      Promise.resolve({ claims: { studentRole: true, classIds: ['A'] } }),
  };
}

async function start() {
  fireEvent.click(await screen.findByRole('button', { name: /^start/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  signInSso();
  hookState.session = buildSession();
  hookState.periodKeys = [];
  hookState.contentPending = false;
  takeSeat.mockImplementation(() => {
    hookState.periodKeys = ['A'];
    return Promise.resolve(true);
  });
  submitResponse.mockResolvedValue(undefined);
  window.history.replaceState({}, '', '/guided-learning/session-1');
});

describe('GuidedLearningStudentApp — per-period access', () => {
  it('seats the student from their class claim, then shows a locked card with no slides', async () => {
    hookState.session = perPeriod({ state: 'closed' });
    render(<GuidedLearningStudentApp />);
    await start();
    expect(await screen.findByText('Not open yet')).toBeInTheDocument();
    expect(takeSeat).toHaveBeenCalledWith(null, ['A']);
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByTestId('gl-player')).toBeNull();
  });

  it('names the scheduled open time', async () => {
    hookState.session = perPeriod({ openAt: Date.now() + 3_600_000 });
    render(<GuidedLearningStudentApp />);
    await start();
    expect(await screen.findByText(/^Opens /)).toBeInTheDocument();
    expect(screen.queryByTestId('gl-player')).toBeNull();
  });

  it('opens the player once the period is open and the steps have loaded', async () => {
    hookState.session = perPeriod({});
    render(<GuidedLearningStudentApp />);
    await start();
    expect(await screen.findByTestId('gl-player')).toBeInTheDocument();
    expect(progressOpts).toHaveBeenLastCalledWith(
      expect.objectContaining({ paused: false })
    );
  });

  it('waits for the hidden steps to load', async () => {
    hookState.session = perPeriod({});
    hookState.contentPending = true;
    render(<GuidedLearningStudentApp />);
    await start();
    expect(await screen.findByText('Loading activity…')).toBeInTheDocument();
    expect(screen.queryByTestId('gl-player')).toBeNull();
  });

  it('lets in a student past a closed period', async () => {
    hookState.session = perPeriod(
      { state: 'closed' },
      { studentAccess: { 'sso-uid-1': Date.now() + 600_000 } }
    );
    render(<GuidedLearningStudentApp />);
    await start();
    expect(await screen.findByTestId('gl-player')).toBeInTheDocument();
  });

  it('refuses an anonymous join in assessment mode', async () => {
    mockAuth.currentUser = null;
    hookState.session = perPeriod({}, { accessMode: 'assessment' });
    render(<GuidedLearningStudentApp />);
    expect(
      await screen.findByText(/needs your school sign-in/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^start/i })).toBeNull();
    expect(takeSeat).not.toHaveBeenCalled();
  });

  it('seats an anonymous joiner by the period they pick', async () => {
    mockAuth.currentUser = null;
    hookState.session = perPeriod({}, { periodNames: ['P1', 'P3'] });
    render(<GuidedLearningStudentApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'P3' }));
    await start();
    await waitFor(() => expect(takeSeat).toHaveBeenCalledWith('P3', []));
  });

  it('keeps a student outside every targeted class on the start screen', async () => {
    takeSeat.mockResolvedValue(false);
    hookState.session = perPeriod({});
    render(<GuidedLearningStudentApp />);
    await start();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You're not in a class this activity was assigned to"
    );
    expect(screen.queryByTestId('gl-player')).toBeNull();
  });

  it('holds the player under a paused overlay when the period closes, then resumes', async () => {
    hookState.session = perPeriod({});
    const { rerender } = render(<GuidedLearningStudentApp />);
    await start();
    await screen.findByTestId('gl-player');

    hookState.session = perPeriod({ state: 'paused' });
    rerender(<GuidedLearningStudentApp />);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Paused for your class'
    );
    expect(screen.getByTestId('gl-player')).toBeInTheDocument();
    expect(screen.getByText(/I.m Done/)).not.toBeVisible();
    expect(progressOpts).toHaveBeenLastCalledWith(
      expect.objectContaining({ paused: true })
    );

    hookState.session = perPeriod({});
    rerender(<GuidedLearningStudentApp />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('submits with the seated class, and freezes instead of finishing when refused', async () => {
    hookState.session = perPeriod({});
    render(<GuidedLearningStudentApp />);
    await start();
    await screen.findByTestId('gl-player');

    submitResponse.mockRejectedValueOnce({ code: 'permission-denied' });
    fireEvent.click(screen.getByText(/I.m Done/));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(submitResponse).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'A', studentAnonymousId: 'sso-uid-1' })
    );
    expect(
      screen.queryByText('Your responses have been submitted.')
    ).toBeNull();
  });

  it('leaves legacy sessions ungated', async () => {
    render(<GuidedLearningStudentApp />);
    await start();
    expect(await screen.findByTestId('gl-player')).toBeInTheDocument();
    expect(takeSeat).not.toHaveBeenCalled();
    expect(progressOpts).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ paused: expect.anything() })
    );
  });
});

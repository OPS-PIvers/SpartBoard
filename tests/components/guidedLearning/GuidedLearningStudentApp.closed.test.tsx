// Past the session's close time (Close now, Archive, sub End) an unsubmitted student sees a closed screen.
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
import type { GuidedLearningResponse, GuidedLearningSession } from '@/types';

type Snap = { exists: () => boolean; data: () => unknown };

const { mockAuth, hookState, submitResponse, listener, playerProps } =
  vi.hoisted(() => ({
    mockAuth: {
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: { uid: 'stu-1', isAnonymous: true },
    },
    hookState: {
      session: null as import('@/types').GuidedLearningSession | null,
    },
    submitResponse: vi.fn(),
    listener: {
      next: null as ((s: Snap) => void) | null,
      error: null as ((err: unknown) => void) | null,
    },
    playerProps: { current: null as Record<string, unknown> | null },
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
  signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'stu-1' } }),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(() => Promise.resolve()),
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(
    (_ref: unknown, next: (s: Snap) => void, error: (err: unknown) => void) => {
      listener.next = next;
      listener.error = error;
      return () => undefined;
    }
  ),
  serverTimestamp: vi.fn(),
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionStudent: () => ({
    session: hookState.session,
    loading: false,
    error: null,
    submitResponse,
    periodKeys: [],
    contentPending: false,
    takeSeat: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => undefined,
}));

vi.mock('@/hooks/useGuidedLearningProgress', () => ({
  useGuidedLearningProgress: () => ({ onStepEvent: vi.fn() }),
}));

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningPlayer',
  () => ({
    GuidedLearningPlayer: (props: Record<string, unknown>) => {
      playerProps.current = props;
      return <div data-testid="gl-player">Player</div>;
    },
  })
);

import { GuidedLearningStudentApp } from '@/components/guidedLearning/GuidedLearningStudentApp';

const session = (): GuidedLearningSession =>
  ({
    id: 'session-1',
    title: 'Cell parts',
    mode: 'structured',
    imageUrls: ['https://img/1.png'],
    publicSteps: [
      { id: 'q1', xPct: 0, yPct: 0, imageIndex: 0 },
      { id: 'q2', xPct: 0, yPct: 0, imageIndex: 0 },
    ],
    teacherUid: 't1',
    createdAt: 1,
    assignmentMode: 'submissions',
  }) as GuidedLearningSession;

const emit = (data: Partial<GuidedLearningResponse> | null) =>
  act(() => {
    listener.next?.({ exists: () => data !== null, data: () => data });
  });

const CLOSED = 'This activity is closed';
const PAST = 1;

beforeEach(() => {
  vi.clearAllMocks();
  listener.next = null;
  listener.error = null;
  playerProps.current = null;
  hookState.session = session();
  submitResponse.mockResolvedValue(undefined);
  window.history.replaceState({}, '', '/guided-learning/session-1');
});

describe('GuidedLearningStudentApp — closed session and reconnect', () => {
  it('shows the closed screen instead of Start once closeAt has passed', async () => {
    hookState.session = { ...session(), closeAt: PAST };
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit(null);
    expect(await screen.findByText(CLOSED)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^start/i })).toBeNull();
  });

  it('still shows a submitted student their submission', async () => {
    hookState.session = { ...session(), closeAt: PAST };
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit({
      sessionId: 'session-1',
      studentAnonymousId: 'stu-1',
      answers: [],
      startedAt: 1,
      completedAt: 2,
      score: null,
    });
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
    expect(screen.queryByText(CLOSED)).toBeNull();
  });

  it('replaces the player when the session closes mid-activity', async () => {
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit(null);
    fireEvent.click(await screen.findByRole('button', { name: /^start/i }));
    await screen.findByTestId('gl-player');

    hookState.session = { ...session(), closeAt: PAST };
    // Any snapshot re-renders with the closed session.
    emit({
      sessionId: 'session-1',
      studentAnonymousId: 'stu-1',
      answers: [],
      startedAt: 1,
      completedAt: null,
      score: null,
    });
    expect(await screen.findByText(CLOSED)).toBeInTheDocument();
    expect(screen.queryByTestId('gl-player')).toBeNull();
  });

  it('keeps an open session playable before its close time', async () => {
    hookState.session = { ...session(), closeAt: Date.now() + 3_600_000 };
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit(null);
    expect(
      await screen.findByRole('button', { name: /^start/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(CLOSED)).toBeNull();
  });

  it('closes an ended view-only share', async () => {
    hookState.session = {
      ...session(),
      assignmentMode: 'view-only',
      closeAt: PAST,
    };
    render(<GuidedLearningStudentApp />);
    expect(await screen.findByText(CLOSED)).toBeInTheDocument();
  });

  it('lets a submit already in flight finish after the close lands', async () => {
    let release: () => void = () => undefined;
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit(null);
    fireEvent.click(await screen.findByRole('button', { name: /^start/i }));
    await screen.findByTestId('gl-player');

    submitResponse.mockImplementationOnce(
      () => new Promise<void>((r) => (release = r))
    );
    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));
    await screen.findByRole('button', { name: 'Submitting…' });

    hookState.session = { ...session(), closeAt: PAST };
    emit(null);
    expect(screen.getByTestId('gl-player')).toBeInTheDocument();
    expect(screen.queryByText(CLOSED)).toBeNull();

    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
    expect(screen.queryByText(CLOSED)).toBeNull();
  });

  it('shows the closed screen when a submit in flight fails after the close', async () => {
    let fail: (err: unknown) => void = () => undefined;
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit(null);
    fireEvent.click(await screen.findByRole('button', { name: /^start/i }));
    await screen.findByTestId('gl-player');

    submitResponse.mockImplementationOnce(
      () => new Promise<void>((_r, reject) => (fail = reject))
    );
    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));
    await screen.findByRole('button', { name: 'Submitting…' });

    hookState.session = { ...session(), closeAt: PAST };
    emit(null);
    await act(async () => {
      fail({ code: 'permission-denied' });
      await Promise.resolve();
    });
    expect(await screen.findByText(CLOSED)).toBeInTheDocument();
    expect(screen.queryByTestId('gl-player')).toBeNull();
  });

  it('shows a reconnecting student who never submitted the closed screen, with saved answers kept', async () => {
    hookState.session = { ...session(), closeAt: PAST };
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit({
      sessionId: 'session-1',
      studentAnonymousId: 'stu-1',
      answers: [{ stepId: 'q1', answer: 'a', isCorrect: null }],
      startedAt: 1,
      completedAt: null,
      score: null,
    });
    expect(await screen.findByText(CLOSED)).toBeInTheDocument();
    expect(submitResponse).not.toHaveBeenCalled();
  });

  it('asks for a refresh when the response listener fails before its first snapshot', async () => {
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.error).not.toBeNull());
    act(() => listener.error?.(new Error('denied')));
    expect(
      await screen.findByText(/load your submission status/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^start/i })).toBeNull();
  });

  it('keeps the last snapshot when the listener fails later', async () => {
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit({
      sessionId: 'session-1',
      studentAnonymousId: 'stu-1',
      answers: [],
      startedAt: 1,
      completedAt: 2,
      score: null,
    });
    await screen.findByText('Your responses have been submitted.');
    act(() => listener.error?.(new Error('offline')));
    expect(
      screen.getByText('Your responses have been submitted.')
    ).toBeInTheDocument();
  });
});

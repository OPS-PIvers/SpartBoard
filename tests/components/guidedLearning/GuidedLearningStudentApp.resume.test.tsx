// P8-8: a reload or a new device resumes from the progress doc, and a finished run isn't asked "not at the end".
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

const {
  mockAuth,
  hookState,
  submitResponse,
  listener,
  playerProps,
  confirm,
  progress,
} = vi.hoisted(() => ({
  mockAuth: {
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: { uid: 'stu-1', isAnonymous: true } as unknown,
  },
  hookState: {
    session: null as import('@/types').GuidedLearningSession | null,
  },
  submitResponse: vi.fn(),
  listener: { next: null as ((s: Snap) => void) | null },
  playerProps: { current: null as Record<string, unknown> | null },
  confirm: vi.fn(),
  progress: {
    stored: undefined as
      | { furthestStepIdx: number; completed: boolean; steps: object }
      | null
      | undefined,
  },
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn(),
    showConfirm: confirm,
    showPrompt: vi.fn(),
  }),
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
  onSnapshot: vi.fn((_ref: unknown, next: (s: Snap) => void) => {
    listener.next = next;
    return () => undefined;
  }),
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
  useGuidedLearningProgress: () => ({
    onStepEvent: vi.fn(),
    stored: progress.stored,
  }),
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
      { id: 's1', xPct: 0, yPct: 0, imageIndex: 0, interactionType: 'tooltip' },
      { id: 's2', xPct: 0, yPct: 0, imageIndex: 0, interactionType: 'tooltip' },
      { id: 's3', xPct: 0, yPct: 0, imageIndex: 0, interactionType: 'tooltip' },
    ],
    teacherUid: 't1',
    createdAt: 1,
    assignmentMode: 'submissions',
    playerV2: true,
  }) as GuidedLearningSession;

const submitted = () =>
  submitResponse.mock.calls.some(
    ([r]) => typeof (r as GuidedLearningResponse).completedAt === 'number'
  );

async function startPlayer() {
  render(<GuidedLearningStudentApp />);
  await waitFor(() => expect(listener.next).not.toBeNull());
  act(() => {
    listener.next?.({ exists: () => false, data: () => null });
  });
  fireEvent.click(await screen.findByRole('button', { name: /^start/i }));
  await screen.findByTestId('gl-player');
}

beforeEach(() => {
  vi.clearAllMocks();
  listener.next = null;
  playerProps.current = null;
  progress.stored = undefined;
  hookState.session = session();
  submitResponse.mockResolvedValue(undefined);
  confirm.mockResolvedValue(true);
  window.history.replaceState({}, '', '/guided-learning/session-1');
});

describe('GuidedLearningStudentApp cross-device resume (P8-8)', () => {
  it('hands the player the progress doc’s furthest step to offer', async () => {
    progress.stored = { furthestStepIdx: 1, completed: false, steps: {} };
    await startPlayer();
    expect(playerProps.current?.resumeServerIdx).toBe(1);
  });

  it('passes nothing while the progress doc is loading or absent', async () => {
    await startPlayer();
    expect(playerProps.current?.resumeServerIdx).toBeUndefined();
  });

  it('still asks "not at the end" when the saved run stopped midway', async () => {
    progress.stored = { furthestStepIdx: 1, completed: false, steps: {} };
    confirm.mockResolvedValueOnce(false);
    await startPlayer();
    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toBe("You haven't reached the end yet.");
  });

  it('seeds reached-the-end from a progress doc at the last step after a reload', async () => {
    progress.stored = { furthestStepIdx: 2, completed: false, steps: {} };
    await startPlayer();
    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(submitted()).toBe(true);
  });

  it('treats a completed progress doc as reached the end too', async () => {
    progress.stored = { furthestStepIdx: 0, completed: true, steps: {} };
    await startPlayer();
    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });
});

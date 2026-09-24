// P8-3: reaching the end shows a Submit card; submitting early or with unanswered questions asks first.
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

const { mockAuth, hookState, submitResponse, listener, playerProps, confirm } =
  vi.hoisted(() => ({
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

const session = (
  over: Partial<GuidedLearningSession> = {}
): GuidedLearningSession =>
  ({
    id: 'session-1',
    title: 'Cell parts',
    mode: 'structured',
    imageUrls: ['https://img/1.png'],
    publicSteps: [
      { id: 's1', xPct: 0, yPct: 0, imageIndex: 0, interactionType: 'tooltip' },
      {
        id: 'q1',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'question',
      },
      {
        id: 'q2',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'question',
      },
    ],
    teacherUid: 't1',
    createdAt: 1,
    assignmentMode: 'submissions',
    playerV2: true,
    ...over,
  }) as GuidedLearningSession;

const answer = (stepId: string) =>
  act(() => {
    (
      playerProps.current?.onAnswer as (
        id: string,
        a: string,
        c: boolean | null
      ) => void
    )(stepId, 'x', null);
  });

const reachEnd = () =>
  act(() => {
    (playerProps.current?.onReachedEnd as () => void)();
  });

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
  hookState.session = session();
  submitResponse.mockResolvedValue(undefined);
  confirm.mockResolvedValue(true);
  window.history.replaceState({}, '', '/guided-learning/session-1');
});

describe('GuidedLearningStudentApp finishing (player v2)', () => {
  it("shows a You're finished card with Submit when the end is reached", async () => {
    await startPlayer();
    expect(screen.queryByText("You're finished")).toBeNull();
    answer('q1');
    answer('q2');
    reachEnd();
    expect(screen.getByRole('dialog')).toHaveTextContent("You're finished");
    // "I'm Done" stays visible alongside the card.
    expect(screen.getByRole('button', { name: /I.m Done/ })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(submitted()).toBe(true);
  });

  it('closes the end card with Go back and keeps the student in the player', async () => {
    await startPlayer();
    reachEnd();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.queryByText("You're finished")).toBeNull();
    expect(screen.getByTestId('gl-player')).toBeInTheDocument();
  });

  it('asks before submitting early, and stays when the student declines', async () => {
    hookState.session = session({
      publicSteps: [
        { id: 's1', xPct: 0, yPct: 0, imageIndex: 0 },
        { id: 's2', xPct: 0, yPct: 0, imageIndex: 0 },
      ] as GuidedLearningSession['publicSteps'],
    });
    confirm.mockResolvedValueOnce(false);
    await startPlayer();
    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toBe("You haven't reached the end yet.");
    expect(confirm.mock.calls[0][1]).toMatchObject({ title: 'Submit now?' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(submitted()).toBe(false);
    expect(screen.getByTestId('gl-player')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
  });

  it('asks with the unanswered count, even from the end card', async () => {
    await startPlayer();
    answer('q1');
    reachEnd();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toBe('1 question unanswered.');
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
  });

  it('counts every unanswered question when I’m Done is pressed early', async () => {
    confirm.mockResolvedValueOnce(false);
    await startPlayer();
    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toBe('2 questions unanswered.');
  });

  it('keeps v1 unchanged: no confirm and no end card', async () => {
    hookState.session = session({ playerV2: false });
    await startPlayer();
    reachEnd();
    expect(screen.queryByText("You're finished")).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });
});

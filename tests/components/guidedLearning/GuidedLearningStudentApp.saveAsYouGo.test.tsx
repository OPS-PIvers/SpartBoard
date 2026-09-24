// Answers save to the response doc as the student goes; submit sets completedAt and only
// then shows the completion screen, with Retry on failure.
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
      currentUser: { uid: 'stu-1', isAnonymous: true } as unknown,
    },
    hookState: {
      session: null as import('@/types').GuidedLearningSession | null,
    },
    submitResponse: vi.fn(),
    listener: { next: null as ((s: Snap) => void) | null },
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

import {
  GuidedLearningStudentApp,
  mergeAnswers,
} from '@/components/guidedLearning/GuidedLearningStudentApp';

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

const answer = (stepId: string, value: string) =>
  act(() => {
    (
      playerProps.current?.onAnswer as (
        id: string,
        a: string,
        c: boolean | null
      ) => void
    )(stepId, value, null);
  });

async function startPlayer() {
  fireEvent.click(await screen.findByRole('button', { name: /^start/i }));
  await screen.findByTestId('gl-player');
}

beforeEach(() => {
  vi.clearAllMocks();
  listener.next = null;
  playerProps.current = null;
  hookState.session = session();
  submitResponse.mockResolvedValue(undefined);
  window.history.replaceState({}, '', '/guided-learning/session-1');
});

describe('GuidedLearningStudentApp — answers saved as they go', () => {
  it('creates the response on the first answer and updates it with the full list after', async () => {
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit(null);
    await startPlayer();

    answer('q1', 'a');
    await waitFor(() => expect(submitResponse).toHaveBeenCalledTimes(1));
    expect(submitResponse.mock.calls[0]).toHaveLength(1);
    expect(submitResponse.mock.calls[0][0]).toMatchObject({
      studentAnonymousId: 'stu-1',
      sessionId: 'session-1',
      completedAt: null,
      score: null,
      answers: [{ stepId: 'q1', answer: 'a', isCorrect: null }],
    });

    answer('q2', 'b');
    await waitFor(() => expect(submitResponse).toHaveBeenCalledTimes(2));
    expect(submitResponse.mock.calls[1][1]).toEqual({ exists: true });
    expect(
      (submitResponse.mock.calls[1][0] as GuidedLearningResponse).answers.map(
        (a) => a.stepId
      )
    ).toEqual(['q1', 'q2']);
  });

  it('offers Start only after the saved response has been read', async () => {
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    expect(screen.queryByRole('button', { name: /^start/i })).toBeNull();
    emit(null);
    expect(
      await screen.findByRole('button', { name: /^start/i })
    ).toBeInTheDocument();
  });

  it('writes one answer at a time, in order', async () => {
    let release: () => void = () => undefined;
    submitResponse.mockImplementationOnce(
      () => new Promise<void>((r) => (release = r))
    );
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit(null);
    await startPlayer();

    answer('q1', 'a');
    answer('q2', 'b');
    await waitFor(() => expect(submitResponse).toHaveBeenCalledTimes(1));
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await waitFor(() => expect(submitResponse).toHaveBeenCalledTimes(2));
    expect(submitResponse.mock.calls[1][1]).toEqual({ exists: true });
  });

  it('restores saved answers after a reload and lands an unsubmitted student back in the player', async () => {
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit({
      sessionId: 'session-1',
      studentAnonymousId: 'stu-1',
      pin: '42',
      answers: [{ stepId: 'q1', answer: 'a', isCorrect: null }],
      startedAt: 1,
      completedAt: null,
      score: null,
    });

    expect(
      screen.queryByText('Your responses have been submitted.')
    ).toBeNull();
    expect(screen.getByPlaceholderText('Enter your class PIN')).toHaveValue(
      '42'
    );
    await startPlayer();
    expect(playerProps.current?.initialAnsweredStepIds).toEqual(['q1']);

    answer('q2', 'b');
    await waitFor(() => expect(submitResponse).toHaveBeenCalledTimes(1));
    const [written, opts] = submitResponse.mock.calls[0] as [
      GuidedLearningResponse,
      unknown,
    ];
    expect(opts).toEqual({ exists: true });
    expect(written.answers.map((a) => a.stepId)).toEqual(['q1', 'q2']);
  });

  it('sends a returning student who submitted to the completion screen', async () => {
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit({
      sessionId: 'session-1',
      studentAnonymousId: 'stu-1',
      answers: [],
      startedAt: 1,
      completedAt: 9,
      score: null,
    });
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^start/i })).toBeNull();
  });
});

describe('GuidedLearningStudentApp — honest submit', () => {
  it('keeps the student in the player with Retry when the submit fails, then finishes on retry', async () => {
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit(null);
    await startPlayer();

    submitResponse.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't submit"
    );
    expect(screen.getByTestId('gl-player')).toBeInTheDocument();
    expect(
      screen.queryByText('Your responses have been submitted.')
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
    const last = submitResponse.mock.calls.at(-1)?.[0] as
      | GuidedLearningResponse
      | undefined;
    expect(typeof last?.completedAt).toBe('number');
  });

  it('waits for the submit write before showing the completion screen', async () => {
    let release: () => void = () => undefined;
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(listener.next).not.toBeNull());
    emit(null);
    await startPlayer();

    submitResponse.mockImplementationOnce(
      () => new Promise<void>((r) => (release = r))
    );
    fireEvent.click(screen.getByRole('button', { name: /I.m Done/ }));
    expect(
      await screen.findByRole('button', { name: 'Submitting…' })
    ).toBeDisabled();
    expect(
      screen.queryByText('Your responses have been submitted.')
    ).toBeNull();

    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(
      await screen.findByText('Your responses have been submitted.')
    ).toBeInTheDocument();
  });
});

describe('mergeAnswers', () => {
  it('keeps saved answers and lets this visit replace a changed one', () => {
    const saved = [
      { stepId: 'q1', answer: 'a', isCorrect: null },
      { stepId: 'q2', answer: 'b', isCorrect: null },
    ];
    const merged = mergeAnswers(saved, [
      { stepId: 'q2', answer: 'c', isCorrect: null },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((a) => a.stepId === 'q2')?.answer).toBe('c');
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { mockAuth, mockProgress, mockSession, playerProps } = vi.hoisted(() => ({
  mockAuth: {
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: null as { uid: string } | null,
  },
  mockProgress: vi.fn(),
  mockSession: { current: {} as Record<string, unknown> },
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
    session: mockSession.current,
    loading: false,
    error: null,
    submitResponse: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => undefined,
}));

vi.mock('@/hooks/useGuidedLearningProgress', () => ({
  useGuidedLearningProgress: (opts: unknown) => {
    mockProgress(opts);
    return { onStepEvent: stepHandler };
  },
}));

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningPlayer',
  () => ({
    GuidedLearningPlayer: (props: Record<string, unknown>) => {
      playerProps.current = props;
      return <div>Player</div>;
    },
  })
);

const stepHandler = vi.fn();

import { GuidedLearningStudentApp } from '@/components/guidedLearning/GuidedLearningStudentApp';

const baseSession = {
  id: 'session-1',
  title: 'Test Set',
  imageUrls: [],
  publicSteps: [{ id: 'a' }, { id: 'b' }],
  mode: 'guided',
  assignmentMode: 'view-only',
  scoreVisibility: 'none',
};

beforeEach(() => {
  mockProgress.mockClear();
  playerProps.current = null;
  mockAuth.currentUser = null;
  window.history.replaceState({}, '', '/guided-learning/session-1');
});

describe('GuidedLearningStudentApp progress writer', () => {
  it('records progress for Player v2 sessions and hands the player its handler', async () => {
    mockSession.current = { ...baseSession, playerV2: true };
    render(<GuidedLearningStudentApp />);
    await waitFor(() =>
      expect(mockProgress).toHaveBeenLastCalledWith({
        sessionId: 'session-1',
        uid: 'anon-uid',
        enabled: true,
        stepIds: ['a', 'b'],
      })
    );
  });

  it('leaves the writer off for sessions without Player v2', async () => {
    mockSession.current = { ...baseSession };
    render(<GuidedLearningStudentApp />);
    await waitFor(() => expect(mockProgress).toHaveBeenCalled());
    expect(mockProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it('passes onStepEvent to the player once it renders', async () => {
    mockSession.current = { ...baseSession, playerV2: true };
    const { findByText } = render(<GuidedLearningStudentApp />);
    const start = await findByText(/start/i);
    start.click();
    await waitFor(() => expect(playerProps.current).not.toBeNull());
    expect(playerProps.current?.onStepEvent).toBe(stepHandler);
  });
});

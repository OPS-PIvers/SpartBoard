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
  mockSession: { current: {} },
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
  it('records progress for stamped sessions and hands the player its handler', async () => {
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

  it('records progress for sessions started before the playerV2 stamp too', async () => {
    mockSession.current = { ...baseSession };
    render(<GuidedLearningStudentApp />);
    await waitFor(() =>
      expect(mockProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: true })
      )
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

describe('GuidedLearningStudentApp mode chip and auto-play', () => {
  it('says what to do instead of the mode name, and asks the player to auto-play', async () => {
    mockSession.current = { ...baseSession, playerV2: true };
    const { findByText, getByTestId, queryByText } = render(
      <GuidedLearningStudentApp />
    );
    const start = await findByText(/start/i);
    expect(getByTestId('gl-start-mode-chip')).toHaveTextContent(
      'Watch the steps'
    );
    expect(queryByText(/guided mode/i)).toBeNull();
    start.click();
    await waitFor(() => expect(playerProps.current).not.toBeNull());
    expect(playerProps.current?.autoPlay).toBe(true);
  });

  it('shows the chip for sessions started before the playerV2 stamp too', async () => {
    mockSession.current = { ...baseSession, mode: 'structured' };
    const { findByTestId } = render(<GuidedLearningStudentApp />);
    expect(await findByTestId('gl-start-mode-chip')).toBeInTheDocument();
  });
});

describe('GuidedLearningStudentApp welcome image', () => {
  it('shows the welcome image above the title, with its alt text', async () => {
    mockSession.current = {
      ...baseSession,
      welcomeEnabled: true,
      welcomeMessage: 'Hello',
      welcomeImageUrl: 'https://example.com/hello.webp',
      welcomeImageAlt: 'A plant cell',
    };
    const { findByRole, getByText } = render(<GuidedLearningStudentApp />);
    const img = await findByRole('img', { name: 'A plant cell' });
    expect(img).toHaveAttribute('src', 'https://example.com/hello.webp');
    expect(
      img.compareDocumentPosition(getByText('Test Set')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(getByText('Hello')).toBeInTheDocument();
  });

  it('treats an image-only welcome as a welcome, with a decorative image', async () => {
    mockSession.current = {
      ...baseSession,
      welcomeEnabled: true,
      welcomeImageUrl: 'https://example.com/hello.webp',
    };
    const { findByText, getByTestId, queryByTestId } = render(
      <GuidedLearningStudentApp />
    );
    await findByText(/get started/i);
    expect(getByTestId('gl-welcome-image')).toHaveAttribute('alt', '');
    expect(queryByTestId('gl-start-mode-chip')).toBeNull();
  });

  it('ignores the image while the welcome is off', async () => {
    mockSession.current = {
      ...baseSession,
      welcomeImageUrl: 'https://example.com/hello.webp',
    };
    const { findByText, queryByTestId } = render(<GuidedLearningStudentApp />);
    await findByText(/start/i);
    expect(queryByTestId('gl-welcome-image')).toBeNull();
  });
});

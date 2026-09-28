/** PIN joiners see a sign-in message instead of the PIN form when the session is stamped closed. */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { mockAuth, mockLookupSession } = vi.hoisted(() => ({
  mockAuth: {
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: { uid: 'anon-uid', isAnonymous: true } as unknown,
  },
  mockLookupSession: vi.fn(),
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
  signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon' } }),
  onAuthStateChanged: vi.fn(() => () => undefined),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('@/hooks/useVideoActivitySession', () => ({
  useVideoActivitySessionStudent: () => ({
    session: null,
    myResponse: null,
    joinStatus: 'idle',
    error: null,
    lookupSession: mockLookupSession,
    joinSession: vi.fn(),
    submitAnswer: vi.fn(),
    completeActivity: vi.fn(),
    reportTabSwitch: vi.fn(),
    periodKeys: [],
  }),
}));

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => null,
}));

import { VideoActivityStudentApp } from '@/components/videoActivity/VideoActivityStudentApp';

describe('VideoActivityStudentApp — anonymous join gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/activity/session-1');
  });

  it('hides the PIN form when the session is stamped false', async () => {
    mockLookupSession.mockResolvedValue({ allowAnonymousJoin: false });
    render(<VideoActivityStudentApp />);
    expect(
      await screen.findByText('Sign in to join this activity.')
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Ask your teacher')).toBeNull();
  });

  it('shows the PIN form when the session is unstamped', async () => {
    mockLookupSession.mockResolvedValue({ periodNames: [] });
    render(<VideoActivityStudentApp />);
    expect(
      await screen.findByPlaceholderText('Ask your teacher')
    ).toBeInTheDocument();
  });

  it('keeps the PIN form for a view-only share stamped false', async () => {
    mockLookupSession.mockResolvedValue({
      allowAnonymousJoin: false,
      mode: 'view-only',
    });
    render(<VideoActivityStudentApp />);
    expect(
      await screen.findByPlaceholderText('Ask your teacher')
    ).toBeInTheDocument();
  });
});

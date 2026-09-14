/**
 * The VA SSO auto-join must wait for the pointer to resolve and must never
 * join for a skipped student — otherwise the response doc is created before
 * the render-time exclusion gate ever runs.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { mockAuth, mockJoinSession, mockLookupSession, mockUsePointer } =
  vi.hoisted(() => ({
    mockAuth: {
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: {
        uid: 'sso-uid',
        isAnonymous: false,
        getIdTokenResult: () =>
          Promise.resolve({ claims: { studentRole: true, classIds: [] } }),
      } as unknown,
    },
    mockJoinSession: vi.fn(),
    mockLookupSession: vi.fn(),
    mockUsePointer: vi.fn(),
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
    joinSession: mockJoinSession,
    submitAnswer: vi.fn(),
    completeActivity: vi.fn(),
    reportTabSwitch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: mockUsePointer,
}));

import { VideoActivityStudentApp } from '@/components/videoActivity/VideoActivityStudentApp';

describe('VideoActivityStudentApp — excluded student join gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookupSession.mockResolvedValue({ periodNames: [], classIds: [] });
    mockJoinSession.mockResolvedValue(undefined);
    window.history.replaceState({}, '', '/activity/session-1');
  });

  it('does not join while the pointer is still resolving', async () => {
    mockUsePointer.mockReturnValue(undefined);
    render(<VideoActivityStudentApp />);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockJoinSession).not.toHaveBeenCalled();
  });

  it('does not join for a skipped student', async () => {
    mockUsePointer.mockReturnValue({ excluded: true });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText(/not for you/i)).toBeInTheDocument();
    expect(mockJoinSession).not.toHaveBeenCalled();
  });

  it('joins once the pointer resolves with no exclusion', async () => {
    mockUsePointer.mockReturnValue(null);
    render(<VideoActivityStudentApp />);
    await waitFor(() => {
      expect(mockJoinSession).toHaveBeenCalled();
    });
  });
});

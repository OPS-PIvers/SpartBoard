/**
 * M17 C3-gl regression coverage: the per-student pointer-doc override read
 * must be gated on the `studentRole` custom claim. Anonymous/PIN joiners
 * (the majority of GL traffic) never hold that claim, so the Firestore rule
 * rejects the read — before the fix, every anonymous join fired a
 * `getDoc` against `/student_assignments/{uid}/items/{sessionId}`, which
 * failed permission-denied and was routed through `logError` on every
 * ordinary join. SSO `studentRole` joiners are the only ones that should
 * ever read the pointer doc.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { mockAuth, mockUseOverride } = vi.hoisted(() => {
  type MockUser = {
    uid: string;
    isAnonymous: boolean;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  };
  return {
    mockAuth: {
      authStateReady: vi.fn().mockResolvedValue(undefined),
      currentUser: null as MockUser | null,
    },
    mockUseOverride: vi.fn(),
  };
});

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
  signInAnonymously: vi
    .fn()
    .mockResolvedValue({ user: { uid: 'anon-fallback-uid' } }),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  serverTimestamp: vi.fn(),
}));

vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionStudent: () => ({
    session: {
      id: 'session-1',
      title: 'Test Set',
      imageUrls: [],
      publicSteps: [],
      mode: 'linear',
      assignmentMode: 'submissions',
      scoreVisibility: 'none',
    },
    loading: false,
    error: null,
    submitResponse: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStudentAssignmentOverride', () => ({
  useStudentAssignmentOverride: mockUseOverride,
}));

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningPlayer',
  () => ({
    GuidedLearningPlayer: () => <div>Player</div>,
  })
);

import { GuidedLearningStudentApp } from '@/components/guidedLearning/GuidedLearningStudentApp';

function mintUser(opts: {
  uid: string;
  isAnonymous: boolean;
  studentRole: boolean;
}) {
  return {
    uid: opts.uid,
    isAnonymous: opts.isAnonymous,
    getIdTokenResult: () =>
      Promise.resolve({ claims: { studentRole: opts.studentRole } }),
  };
}

describe('GuidedLearningStudentApp — pointer-override gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOverride.mockReset().mockReturnValue(undefined);
    mockAuth.authStateReady.mockReset().mockResolvedValue(undefined);
    mockAuth.currentUser = null;
    window.history.replaceState({}, '', '/guided-learning/session-1');
  });

  it('anonymous/PIN joiners never enable the pointer-override hook (zero reads, zero logError)', async () => {
    mockAuth.currentUser = null; // triggers signInAnonymously fallback

    render(<GuidedLearningStudentApp />);

    await screen.findByText(/Player|Loading|PIN|Start/i).catch(() => {
      // Screen content varies by start-screen copy; presence isn't the
      // point — the assertion below on the hook call is.
    });

    // Give the async auth-init effect a tick to settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(mockUseOverride).toHaveBeenCalled();
    const lastCallArgs =
      mockUseOverride.mock.calls[mockUseOverride.mock.calls.length - 1];
    // Third arg is `enabled` — must be false for an anonymous joiner.
    expect(lastCallArgs[2]).toBe(false);
  });

  it('SSO studentRole joiners enable the pointer-override hook', async () => {
    mockAuth.currentUser = mintUser({
      uid: 'sso-uid-1',
      isAnonymous: false,
      studentRole: true,
    });

    render(<GuidedLearningStudentApp />);

    await new Promise((r) => setTimeout(r, 0));

    expect(mockUseOverride).toHaveBeenCalled();
    const lastCallArgs =
      mockUseOverride.mock.calls[mockUseOverride.mock.calls.length - 1];
    expect(lastCallArgs[0]).toBe('sso-uid-1');
    expect(lastCallArgs[1]).toBe('session-1');
    expect(lastCallArgs[2]).toBe(true);
  });

  it('non-SSO authenticated users without the studentRole claim keep the hook disabled', async () => {
    mockAuth.currentUser = mintUser({
      uid: 'teacher-uid-1',
      isAnonymous: false,
      studentRole: false,
    });

    render(<GuidedLearningStudentApp />);

    await new Promise((r) => setTimeout(r, 0));

    const lastCallArgs =
      mockUseOverride.mock.calls[mockUseOverride.mock.calls.length - 1];
    expect(lastCallArgs[2]).toBe(false);
  });
});

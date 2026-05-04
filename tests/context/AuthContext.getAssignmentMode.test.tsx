import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import * as firebaseAuth from 'firebase/auth';
import * as firestore from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/useAuth';
import type { AuthContextType } from '@/context/AuthContextValue';
import type { GlobalFeaturePermission } from '@/types';

/**
 * Tests `useAuth().getAssignmentMode(widget)` — the helper every consumer of
 * the assignment-modes feature relies on. The contract is "fail closed to
 * 'submissions'": legacy clients without a permission doc, or with a
 * malformed config, must default to the safe-for-everyone behavior so an
 * admin oversight never accidentally suppresses submissions.
 */

vi.mock('firebase/auth', async () => {
  const actual =
    await vi.importActual<typeof import('firebase/auth')>('firebase/auth');
  return {
    ...actual,
    onAuthStateChanged: vi.fn(),
    signInWithPopup: vi.fn(),
    signInAnonymously: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
  })),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
  })),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => false,
    data: () => undefined,
  }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
}));

const ctxHolder: { current: AuthContextType | null } = { current: null };

const Probe: React.FC = () => {
  const ctx = useAuth();
  React.useEffect(() => {
    ctxHolder.current = ctx;
  });
  return null;
};

function getCtx(): AuthContextType {
  if (!ctxHolder.current) {
    throw new Error('AuthContext was never captured by the Probe');
  }
  return ctxHolder.current;
}

function buildFakeUser(): User {
  return {
    uid: 'test-uid',
    email: 'teacher@example.com',
    displayName: 'Teacher',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    refreshToken: '',
    metadata: {} as User['metadata'],
    providerId: 'firebase',
    tenantId: null,
    delete: vi.fn(),
    getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
    getIdTokenResult: vi.fn().mockResolvedValue({
      claims: {},
      authTime: '',
      issuedAtTime: '',
      expirationTime: '',
      signInProvider: '',
      signInSecondFactor: null,
      token: 'mock-id-token',
    }),
    reload: vi.fn(),
    toJSON: () => ({}),
    phoneNumber: null,
  } as unknown as User;
}

interface CollectionRef {
  __path?: string;
}

/**
 * Drive the AuthProvider's `onSnapshot` for the global_permissions
 * collection with the supplied list of permission docs. Other onSnapshot
 * calls (feature_permissions, members, etc.) are stubbed as no-ops so the
 * provider mounts cleanly without spurious data.
 */
function deliverGlobalPermissions(perms: GlobalFeaturePermission[]): void {
  vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
    const path = (ref as unknown as CollectionRef).__path ?? '';
    if (path === 'global_permissions') {
      const snapshot = {
        forEach: (cb: (doc: { id: string; data: () => unknown }) => void) => {
          perms.forEach((p) => {
            cb({ id: p.featureId, data: () => p });
          });
        },
      };
      // The runtime callback signature is `(snapshot) => ...` — the cast
      // here keeps the test's mock surface narrow without depending on
      // Firestore's full QuerySnapshot type.
      (onNext as unknown as (s: typeof snapshot) => void)(snapshot);
    }
    return () => undefined;
  });
}

async function mountWithPerms(perms: GlobalFeaturePermission[]): Promise<void> {
  ctxHolder.current = null;
  deliverGlobalPermissions(perms);

  const onAuthMock = vi.mocked(firebaseAuth.onAuthStateChanged);
  onAuthMock.mockImplementation(() => () => undefined);

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

  const lastCall = onAuthMock.mock.calls[onAuthMock.mock.calls.length - 1];
  if (!lastCall) {
    throw new Error('onAuthStateChanged was never called');
  }
  const listener = lastCall[1] as (u: User | null) => void;
  const user = buildFakeUser();
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    writable: true,
    value: user,
  });
  act(() => {
    listener(user);
  });

  // Wait for the global_permissions onSnapshot to flush into context state.
  await waitFor(() => {
    expect(ctxHolder.current).not.toBeNull();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
});

describe('AuthContext — getAssignmentMode', () => {
  it("defaults to 'submissions' for every widget when no permission doc exists", async () => {
    await mountWithPerms([]);

    expect(getCtx().getAssignmentMode('quiz')).toBe('submissions');
    expect(getCtx().getAssignmentMode('videoActivity')).toBe('submissions');
    expect(getCtx().getAssignmentMode('miniApp')).toBe('submissions');
    expect(getCtx().getAssignmentMode('guidedLearning')).toBe('submissions');
  });

  it("defaults to 'submissions' when the permission doc has no config object", async () => {
    await mountWithPerms([
      {
        featureId: 'assignment-modes',
        accessLevel: 'public',
        betaUsers: [],
        enabled: true,
      },
    ]);

    expect(getCtx().getAssignmentMode('quiz')).toBe('submissions');
    expect(getCtx().getAssignmentMode('miniApp')).toBe('submissions');
  });

  it('returns the configured mode per widget when set', async () => {
    await mountWithPerms([
      {
        featureId: 'assignment-modes',
        accessLevel: 'public',
        betaUsers: [],
        enabled: true,
        config: {
          quiz: 'view-only',
          miniApp: 'view-only',
          // videoActivity + guidedLearning intentionally absent — they
          // must fall through to 'submissions'.
        },
      },
    ]);

    expect(getCtx().getAssignmentMode('quiz')).toBe('view-only');
    expect(getCtx().getAssignmentMode('miniApp')).toBe('view-only');
    // Missing keys default — this is the guardrail. Without it, an admin
    // who toggles only Mini Apps to view-only would unintentionally mute
    // submissions for the other three.
    expect(getCtx().getAssignmentMode('videoActivity')).toBe('submissions');
    expect(getCtx().getAssignmentMode('guidedLearning')).toBe('submissions');
  });

  it('falls back when the config carries an unrecognized mode value', async () => {
    // Suppress the warn from parseAssignmentModesConfig so the test output
    // stays clean; the parser test covers the warning behavior itself.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await mountWithPerms([
      {
        featureId: 'assignment-modes',
        accessLevel: 'public',
        betaUsers: [],
        enabled: true,
        // Simulate a future client writing a value this client doesn't know
        // (e.g., a hypothetical 'review-only'). The default must be safe —
        // the alternative would be silently muting submissions on a client
        // that doesn't yet understand the new mode.
        config: { quiz: 'review-only' as unknown as 'view-only' },
      },
    ]);

    expect(getCtx().getAssignmentMode('quiz')).toBe('submissions');
  });
});

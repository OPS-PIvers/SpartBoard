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

// M1 full sign-in lockout: when the org-member snapshot reports
// `status === 'inactive'`, AuthContext latches the sticky `accessDeactivated`
// flag. The consumer (AuthenticatedApp) signs the user out and shows the
// DeactivatedScreen; these tests assert the AuthContext half of that contract:
//   - inactive member  → accessDeactivated flips true
//   - active member    → accessDeactivated stays false
//   - signInWithGoogle → clears the sticky flag for a fresh attempt
//
// Mirrors the harness in AuthContext.membershipError.test.tsx.

vi.mock('firebase/auth', async () => {
  const actual =
    await vi.importActual<typeof import('firebase/auth')>('firebase/auth');
  return {
    ...actual,
    onAuthStateChanged: vi.fn(),
    signInWithPopup: vi.fn().mockResolvedValue({ user: {} }),
    signInAnonymously: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    GoogleAuthProvider: Object.assign(
      vi.fn(() => ({ addScope: vi.fn(), setCustomParameters: vi.fn() })),
      { credentialFromResult: vi.fn(() => null) }
    ),
  };
});

let httpsCallableImpl: () => Promise<{ data: { orgId: string | null } }> = () =>
  Promise.resolve({ data: { orgId: 'acme' } });
vi.mock('firebase/functions', () => ({
  httpsCallable: () => () => httpsCallableImpl(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
  })),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
  })),
  getDoc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  query: vi.fn((c: unknown) => c),
  limit: vi.fn(() => undefined),
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
  if (!ctxHolder.current) throw new Error('AuthContext not captured');
  return ctxHolder.current;
}

function buildFakeUser(email: string): User {
  return {
    uid: 'test-uid',
    email,
    displayName: 'Test',
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

interface PathRef {
  __path?: string;
}
type DocSnap = Awaited<ReturnType<typeof firestore.getDoc>>;

const EMAIL = 'teacher@example.com';
const MEMBER_PATH = `organizations/acme/members/${EMAIL}`;

let memberOnNext: ((snap: unknown) => void) | null = null;

function setupGetDoc(): void {
  vi.mocked(firestore.getDoc).mockImplementation((ref) => {
    const path = (ref as unknown as PathRef).__path ?? '';
    if (path.endsWith('userProfile/profile')) {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ selectedBuildings: [] }),
      } as unknown as DocSnap);
    }
    return Promise.resolve({
      exists: () => false,
      data: () => undefined,
    } as unknown as DocSnap);
  });
}

function wireSnapshots(): void {
  memberOnNext = null;
  vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
    const path = (ref as unknown as PathRef).__path ?? '';
    const fire = (snapshot: unknown) =>
      (onNext as unknown as (s: unknown) => void)(snapshot);
    if (path === 'global_permissions' || path === 'feature_permissions') {
      fire({ forEach: () => undefined });
    } else if (path === MEMBER_PATH) {
      memberOnNext = (snap: unknown) =>
        (onNext as unknown as (s: unknown) => void)(snap);
    }
    return () => undefined;
  });
}

async function mount(): Promise<void> {
  ctxHolder.current = null;
  setupGetDoc();
  wireSnapshots();

  const onAuthMock = vi.mocked(firebaseAuth.onAuthStateChanged);
  onAuthMock.mockImplementation(() => () => undefined);

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

  const lastCall = onAuthMock.mock.calls[onAuthMock.mock.calls.length - 1];
  if (!lastCall) throw new Error('onAuthStateChanged was never called');
  const listener = lastCall[1] as (u: User | null) => void;
  const user = buildFakeUser(EMAIL);
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    writable: true,
    value: user,
  });
  act(() => {
    listener(user);
  });

  await waitFor(() => {
    expect(memberOnNext).not.toBeNull();
  });
}

function fireMemberStatus(status: string): void {
  act(() => {
    memberOnNext?.({
      exists: () => true,
      data: () => ({
        orgId: 'acme',
        roleId: 'teacher',
        buildingIds: ['b1'],
        status,
      }),
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
  httpsCallableImpl = () => Promise.resolve({ data: { orgId: 'acme' } });
});

describe('AuthContext — M1 deactivation lockout', () => {
  it('latches accessDeactivated true when member status is inactive', async () => {
    await mount();
    fireMemberStatus('inactive');
    await waitFor(() => {
      expect(getCtx().accessDeactivated).toBe(true);
    });
  });

  it('leaves accessDeactivated false for an active member', async () => {
    await mount();
    fireMemberStatus('active');
    await waitFor(() => {
      expect(getCtx().orgId).toBe('acme');
    });
    expect(getCtx().accessDeactivated).toBe(false);
  });

  it('signInWithGoogle clears the sticky deactivation flag', async () => {
    await mount();
    fireMemberStatus('inactive');
    await waitFor(() => {
      expect(getCtx().accessDeactivated).toBe(true);
    });

    await act(async () => {
      await getCtx().signInWithGoogle();
    });
    await waitFor(() => {
      expect(getCtx().accessDeactivated).toBe(false);
    });
  });
});

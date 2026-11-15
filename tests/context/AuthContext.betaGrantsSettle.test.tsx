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
  getDoc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
  // Silences "No 'X' export defined on the firebase/firestore mock" stderr
  // noise from the returning-user probe at AuthContext.tsx:~1217.
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
    metadata: {},
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
});

type SnapCb = (s: unknown) => void;

describe('AuthContext beta grants settle gate', () => {
  it('stays not-loaded until the beta_grants snapshot arrives, then grants beta access', async () => {
    let grantsCb: SnapCb | null = null;
    vi.mocked(firestore.getDoc).mockImplementation(() =>
      Promise.resolve({
        exists: () => false,
        data: () => undefined,
      } as unknown as Awaited<ReturnType<typeof firestore.getDoc>>)
    );
    vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
      const path = (ref as unknown as { __path?: string }).__path ?? '';
      if (path.startsWith('beta_grants/')) {
        grantsCb = onNext as unknown as SnapCb;
      } else if (path === 'global_permissions_public') {
        (onNext as unknown as SnapCb)({
          forEach: (cb: (d: { id: string; data: () => unknown }) => void) =>
            cb({
              id: 'getting-started',
              data: () => ({
                featureId: 'getting-started',
                accessLevel: 'beta',
                betaUsers: [],
                enabled: true,
              }),
            }),
        });
      } else if (path === 'feature_permissions_public') {
        (onNext as unknown as SnapCb)({ forEach: () => undefined });
      }
      return () => undefined;
    });
    const onAuthMock = vi.mocked(firebaseAuth.onAuthStateChanged);
    onAuthMock.mockImplementation(() => () => undefined);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    const listener = onAuthMock.mock.calls[
      onAuthMock.mock.calls.length - 1
    ]?.[1] as (u: User | null) => void;
    const user = buildFakeUser('beta@example.com');
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: user,
    });
    act(() => listener(user));

    await waitFor(() => expect(grantsCb).not.toBeNull());
    expect(getCtx().globalPermissionsLoaded).toBe(false);

    act(() => {
      (grantsCb as unknown as SnapCb)({
        data: () => ({ features: [], global: ['getting-started'] }),
      });
    });
    await waitFor(() => expect(getCtx().globalPermissionsLoaded).toBe(true));
    expect(getCtx().canAccessFeature('getting-started')).toBe(true);
  });
});

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

// These tests drive the membership onSnapshot ERROR callback directly to assert
// the error-type-aware recovery in AuthContext:
//  - permission-denied  → CLEAR org/role/building (revoked member, Finding 4)
//  - transient AFTER a real org resolved → PRESERVE last-known (paying org)
//  - transient on FIRST load (never resolved) → CLEAR (no stale state, Finding 3)
// Orono is unaffected throughout (tier derives 'internal' from the email domain
// regardless of orgId), so all cases here use an external (paying-org) email.

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

// Resolve the org callable to a concrete org so `subscribeToMembership` runs
// against `organizations/<orgId>/members/<email>` and we can target its
// onSnapshot callbacks.
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

const EXTERNAL_EMAIL = 'teacher@example.com';
const MEMBER_PATH = `organizations/acme/members/${EXTERNAL_EMAIL}`;

// Captured member-doc onSnapshot callbacks so a test can fire success/error.
let memberOnNext: ((snap: unknown) => void) | null = null;
let memberOnError: ((err: unknown) => void) | null = null;

function setupGetDoc(): void {
  vi.mocked(firestore.getDoc).mockImplementation((ref) => {
    const path = (ref as unknown as PathRef).__path ?? '';
    if (path.endsWith('userProfile/profile')) {
      return Promise.resolve({
        exists: () => true,
        data: () => ({ selectedBuildings: [] }),
      } as unknown as DocSnap);
    }
    // Not admin.
    return Promise.resolve({
      exists: () => false,
      data: () => undefined,
    } as unknown as DocSnap);
  });
}

function wireSnapshots(): void {
  memberOnNext = null;
  memberOnError = null;
  vi.mocked(firestore.onSnapshot).mockImplementation(
    (ref, onNext, onError?: unknown) => {
      const path = (ref as unknown as PathRef).__path ?? '';
      const fire = (snapshot: unknown) =>
        (onNext as unknown as (s: unknown) => void)(snapshot);
      if (path === 'global_permissions' || path === 'feature_permissions') {
        fire({ forEach: () => undefined });
      } else if (path === MEMBER_PATH) {
        memberOnNext = (snap: unknown) =>
          (onNext as unknown as (s: unknown) => void)(snap);
        memberOnError = onError as (err: unknown) => void;
      }
      return () => undefined;
    }
  );
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
  const user = buildFakeUser(EXTERNAL_EMAIL);
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    writable: true,
    value: user,
  });
  act(() => {
    listener(user);
  });

  // Wait for the membership subscription to be wired (callable resolved).
  await waitFor(() => {
    expect(memberOnError).not.toBeNull();
  });
}

function fireSuccessResolvedOrg(): void {
  act(() => {
    memberOnNext?.({
      exists: () => true,
      data: () => ({ orgId: 'acme', roleId: 'teacher', buildingIds: ['b1'] }),
    });
  });
}

function fireError(code?: string): void {
  act(() => {
    memberOnError?.(code ? { code } : new Error('boom'));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
  httpsCallableImpl = () => Promise.resolve({ data: { orgId: 'acme' } });
});

describe('AuthContext — membership onSnapshot error recovery', () => {
  it('permission-denied CLEARS org/role/building even after a real org resolved (revoked member)', async () => {
    await mount();
    fireSuccessResolvedOrg();
    await waitFor(() => {
      expect(getCtx().orgId).toBe('acme');
      expect(getCtx().roleId).toBe('teacher');
      expect(getCtx().buildingIds).toEqual(['b1']);
      expect(getCtx().hasOrg).toBe(true);
    });

    fireError('permission-denied');
    await waitFor(() => {
      expect(getCtx().orgId).toBeNull();
      expect(getCtx().roleId).toBeNull();
      expect(getCtx().buildingIds).toEqual([]);
      expect(getCtx().hasOrg).toBe(false);
    });
  });

  it('transient error PRESERVES last-known state after a real org has resolved', async () => {
    await mount();
    fireSuccessResolvedOrg();
    await waitFor(() => {
      expect(getCtx().orgId).toBe('acme');
    });

    fireError('unavailable'); // transient, not permission-denied
    // State must be preserved — give the listener a tick and assert no change.
    await new Promise((r) => setTimeout(r, 10));
    expect(getCtx().orgId).toBe('acme');
    expect(getCtx().roleId).toBe('teacher');
    expect(getCtx().buildingIds).toEqual(['b1']);
    expect(getCtx().hasOrg).toBe(true);
  });

  it('transient error on FIRST load (never resolved) CLEARS rather than preserving stale state', async () => {
    await mount();
    // No success snapshot delivered yet — first load.
    fireError('unavailable');
    await waitFor(() => {
      expect(getCtx().orgId).toBeNull();
      expect(getCtx().roleId).toBeNull();
      expect(getCtx().buildingIds).toEqual([]);
      expect(getCtx().hasOrg).toBe(false);
    });
  });

  it('always marks membership resolved on error so consumers do not stall', async () => {
    await mount();
    fireError('permission-denied');
    // userTier resolving to 'free' (not the in-flight default) proves
    // membershipResolved flipped true. External email + cleared org → free.
    await waitFor(() => {
      expect(getCtx().userTier).toBe('free');
    });
  });
});

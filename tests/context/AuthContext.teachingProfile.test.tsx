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

// Teaching profile on the profile doc: gradesTaught (absent/empty = derive
// from buildings) and subjectsTaught. userGradeLevels maps the effective
// grades back to bands so a saved grade list overrides the building bands.

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
  // Preserve the path segments so individual tests can target the profile
  // doc specifically — otherwise the admin/membership/profile getDoc calls
  // are indistinguishable.
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
  })),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    __path: segments.join('/'),
  })),
  getDoc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
}));

// ---------------------------------------------------------------------------
// Probe + harness
// ---------------------------------------------------------------------------

interface DocRef {
  __path: string;
}

// Holder for the latest AuthContext value the Probe sees. Writing to it from
// a `useEffect` (post-commit) rather than during render keeps the
// `react-hooks/immutability` rule happy — that rule fires on any module-
// level mutation inside a render function.
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

function buildFakeUser(uid = 'test-uid', email = 'teacher@example.com'): User {
  return {
    uid,
    email,
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

type DocSnap = Awaited<ReturnType<typeof firestore.getDoc>>;

function setProfileDocData(data: Record<string, unknown> | null): void {
  vi.mocked(firestore.getDoc).mockImplementation((ref) => {
    const path = (ref as unknown as DocRef).__path ?? '';
    if (path.endsWith('userProfile/profile')) {
      if (data === null) {
        return Promise.resolve({
          exists: () => false,
          data: () => undefined,
        } as unknown as DocSnap);
      }
      return Promise.resolve({
        exists: () => true,
        data: () => data,
      } as unknown as DocSnap);
    }
    // admins/{email}, etc. — non-existent so isAdmin resolves to false and
    // the test isn't accidentally elevated to admin (which gates a setDoc
    // path we want to leave alone here).
    return Promise.resolve({
      exists: () => false,
      data: () => undefined,
    } as unknown as DocSnap);
  });
}

async function mountWithProfile(
  profile: Record<string, unknown> | null
): Promise<void> {
  ctxHolder.current = null;
  setProfileDocData(profile);

  // No-op snapshot subscriptions so user_roles / app_settings / org member /
  // feature_permissions / global_permissions / org buildings listeners don't
  // fire spurious data into the context during these tests.
  vi.mocked(firestore.onSnapshot).mockImplementation(() => () => undefined);

  const onAuthMock = vi.mocked(firebaseAuth.onAuthStateChanged);
  onAuthMock.mockImplementation(() => () => undefined);

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

  // The AuthProvider registers its onAuthStateChanged listener on mount.
  // Drive a fake user through it so the profile-load effect (which depends
  // on `user`) actually runs.
  const lastCall = onAuthMock.mock.calls[onAuthMock.mock.calls.length - 1];
  if (!lastCall) {
    throw new Error(
      'onAuthStateChanged was never called — provider failed to mount'
    );
  }
  const listener = lastCall[1] as (u: User | null) => void;
  const user = buildFakeUser();
  // `auth.currentUser` is read by several AuthContext effects to short-circuit
  // late callbacks for previous users; align it with the mounted user so those
  // guards don't drop our snapshot deliveries.
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    writable: true,
    value: user,
  });

  act(() => {
    listener(user);
  });

  // `waitFor` retries the assertion across microtask flushes, so it handles
  // the async work the profile-load effect does after the synchronous
  // listener fires (`getDoc` resolving, the `useEffect` dependency on
  // `user` re-running, etc.).
  await waitFor(() => {
    expect(ctxHolder.current?.profileLoaded).toBe(true);
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
  window.localStorage.clear();
  vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
});
describe('AuthContext — teaching profile', () => {
  it('derives grades from the selected buildings when unset', async () => {
    await mountWithProfile({ selectedBuildings: ['high'] });
    expect(getCtx().gradesTaught).toBeNull();
    expect(getCtx().buildingGrades).toEqual(['9', '10', '11', '12']);
    expect(getCtx().effectiveGrades).toEqual(['9', '10', '11', '12']);
    expect(getCtx().userGradeLevels).toEqual(['9-12']);
    expect(getCtx().subjectsTaught).toEqual([]);
  });

  it('hydrates saved grades and lets them override the building bands', async () => {
    await mountWithProfile({
      selectedBuildings: ['high'],
      gradesTaught: ['2', 'k', 'bogus'],
      subjectsTaught: ['ela', 7],
    });
    expect(getCtx().gradesTaught).toEqual(['K', '2']);
    expect(getCtx().effectiveGrades).toEqual(['K', '2']);
    expect(getCtx().userGradeLevels).toEqual(['k-2']);
    expect(getCtx().subjectsTaught).toEqual(['ela']);
  });

  it('treats an empty saved grade list as unset', async () => {
    await mountWithProfile({ selectedBuildings: ['middle'], gradesTaught: [] });
    expect(getCtx().gradesTaught).toBeNull();
    expect(getCtx().userGradeLevels).toEqual(['6-8']);
  });

  it('writes grades with merge:true and resets with an empty array', async () => {
    await mountWithProfile({ selectedBuildings: ['high'] });
    vi.mocked(firestore.setDoc).mockClear();

    await act(async () => {
      await getCtx().updateTeachingProfile({ gradesTaught: ['10', '12'] });
    });
    expect(getCtx().gradesTaught).toEqual(['10', '12']);
    expect(getCtx().userGradeLevels).toEqual(['9-12']);

    await act(async () => {
      await getCtx().updateTeachingProfile({ gradesTaught: null });
    });
    expect(getCtx().gradesTaught).toBeNull();
    expect(getCtx().effectiveGrades).toEqual(['9', '10', '11', '12']);

    const profileWrites = vi
      .mocked(firestore.setDoc)
      .mock.calls.filter(([ref]) =>
        (ref as unknown as DocRef).__path?.endsWith('userProfile/profile')
      );
    expect(profileWrites).toHaveLength(2);
    expect(profileWrites[0][1]).toEqual({ gradesTaught: ['10', '12'] });
    expect(profileWrites[0][2]).toEqual({ merge: true });
    expect(profileWrites[1][1]).toEqual({ gradesTaught: [] });
  });

  it('writes subjects deduplicated and independently of grades', async () => {
    await mountWithProfile(null);
    vi.mocked(firestore.setDoc).mockClear();
    await act(async () => {
      await getCtx().updateTeachingProfile({
        subjectsTaught: ['math', 'math', ''],
      });
    });
    expect(getCtx().subjectsTaught).toEqual(['math']);
    const profileWrites = vi
      .mocked(firestore.setDoc)
      .mock.calls.filter(([ref]) =>
        (ref as unknown as DocRef).__path?.endsWith('userProfile/profile')
      );
    expect(profileWrites).toHaveLength(1);
    expect(profileWrites[0][1]).toEqual({ subjectsTaught: ['math'] });
  });
});

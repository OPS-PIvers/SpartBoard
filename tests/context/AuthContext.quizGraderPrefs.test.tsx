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

/**
 * Free Response grader account preferences on `/users/{uid}/userProfile/profile`:
 *
 *   - quizGraderMode: 'question' | 'student'   (default 'question')
 *   - quizGraderAutoAdvance: boolean           (default true)
 *
 * Same six invariants as AuthContext.quizMonitorPrefs.test.tsx: defaults,
 * hydration, type-guard rejection, sanitized merge write, no bleed between
 * calls, optimistic update, and a surfaced rejection.
 */

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthContext — quiz grader account preferences', () => {
  describe('hydration', () => {
    it('falls back to defaults when the profile doc omits both fields', async () => {
      await mountWithProfile({ setupCompleted: true });
      expect(getCtx().quizGraderMode).toBe('question');
      expect(getCtx().quizGraderAutoAdvance).toBe(true);
    });

    it('hydrates valid persisted values from the profile doc', async () => {
      await mountWithProfile({
        quizGraderMode: 'student',
        quizGraderAutoAdvance: false,
      });
      expect(getCtx().quizGraderMode).toBe('student');
      expect(getCtx().quizGraderAutoAdvance).toBe(false);
    });

    it('rejects garbage values and falls back to the defaults', async () => {
      await mountWithProfile({
        quizGraderMode: 'sideways',
        quizGraderAutoAdvance: 'yes',
      });
      expect(getCtx().quizGraderMode).toBe('question');
      expect(getCtx().quizGraderAutoAdvance).toBe(true);
    });
  });

  describe('updateAccountPreferences', () => {
    it('writes a sanitized payload — only the requested field, with merge:true', async () => {
      await mountWithProfile({ quizGraderMode: 'question' });
      vi.mocked(firestore.setDoc).mockClear();

      await act(async () => {
        await getCtx().updateAccountPreferences({ quizGraderMode: 'student' });
      });

      const profileWrites = vi
        .mocked(firestore.setDoc)
        .mock.calls.filter(([ref]) =>
          (ref as unknown as DocRef).__path?.endsWith('userProfile/profile')
        );
      expect(profileWrites).toHaveLength(1);
      const [, payload, options] = profileWrites[0];
      expect(payload).toEqual({ quizGraderMode: 'student' });
      expect(options).toEqual({ merge: true });
    });

    it('does not bleed the previous call into the next call', async () => {
      await mountWithProfile(null);
      vi.mocked(firestore.setDoc).mockClear();

      await act(async () => {
        await getCtx().updateAccountPreferences({
          quizGraderAutoAdvance: false,
        });
      });
      await act(async () => {
        await getCtx().updateAccountPreferences({ quizGraderMode: 'student' });
      });

      const profileWrites = vi
        .mocked(firestore.setDoc)
        .mock.calls.filter(([ref]) =>
          (ref as unknown as DocRef).__path?.endsWith('userProfile/profile')
        );
      expect(profileWrites).toHaveLength(2);
      expect(profileWrites[0][1]).toEqual({ quizGraderAutoAdvance: false });
      expect(profileWrites[1][1]).toEqual({ quizGraderMode: 'student' });
    });

    it('applies the optimistic state update before setDoc resolves', async () => {
      await mountWithProfile({ quizGraderAutoAdvance: true });
      let resolveSetDoc: () => void = () => undefined;
      const pending = new Promise<void>((resolve) => {
        resolveSetDoc = resolve;
      });
      vi.mocked(firestore.setDoc).mockReturnValueOnce(pending);

      let call: Promise<void> = Promise.resolve();
      act(() => {
        call = getCtx().updateAccountPreferences({
          quizGraderAutoAdvance: false,
        });
      });
      expect(getCtx().quizGraderAutoAdvance).toBe(false);

      resolveSetDoc();
      await act(async () => {
        await call;
      });
      expect(getCtx().quizGraderAutoAdvance).toBe(false);
    });

    it('surfaces a failed write as a rejection', async () => {
      await mountWithProfile({ quizGraderMode: 'question' });
      const errSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      vi.mocked(firestore.setDoc).mockRejectedValueOnce(new Error('offline'));
      await expect(
        act(async () => {
          await getCtx().updateAccountPreferences({
            quizGraderMode: 'student',
          });
        })
      ).rejects.toThrow('offline');
      errSpy.mockRestore();
    });
  });
});

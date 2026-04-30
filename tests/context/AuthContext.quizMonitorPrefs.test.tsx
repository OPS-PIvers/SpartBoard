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
 * Tests for the two quiz-monitor account-level preferences added in PR #1449
 * (commits ec367e5, 3ee1c90):
 *
 *   - quizMonitorColorsEnabled: boolean   (default true)
 *   - quizMonitorScoreDisplay: 'percent' | 'count' | 'hidden'  (default 'percent')
 *
 * Both live on `/users/{uid}/userProfile/profile`. The hydration path is the
 * profile-load `getDoc` effect inside AuthContext; the write path is
 * `updateAccountPreferences`. These tests pin:
 *
 *   1. Default fallback when the profile doc lacks the field.
 *   2. Hydration of valid persisted values.
 *   3. Type-guard rejection of garbage values (must fall back to default).
 *   4. Sanitized write payload (no undefined / unrelated keys, merge:true).
 *   5. Optimistic local state update before the network write resolves.
 *   6. Failed write surfaces a rejection so QuizLiveMonitor's `.catch(...)`
 *      toast handler can fire.
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

describe('AuthContext — quizMonitor account preferences', () => {
  describe('hydration', () => {
    it('falls back to defaults when the profile doc omits both fields', async () => {
      // A profile doc that exists but predates these prefs: only the older
      // keys are present. The provider must not surface `undefined` to
      // consumers — it should hand back the documented defaults.
      await mountWithProfile({
        selectedBuildings: ['high'],
        setupCompleted: true,
      });

      expect(getCtx().quizMonitorColorsEnabled).toBe(true);
      expect(getCtx().quizMonitorScoreDisplay).toBe('percent');
    });

    it('hydrates valid persisted values from the profile doc', async () => {
      await mountWithProfile({
        quizMonitorColorsEnabled: false,
        quizMonitorScoreDisplay: 'count',
      });

      expect(getCtx().quizMonitorColorsEnabled).toBe(false);
      expect(getCtx().quizMonitorScoreDisplay).toBe('count');
    });

    it('rejects a garbage scoreDisplay string and falls back to "percent"', async () => {
      // Without the type guard, any string would be assigned and then leak
      // into the QuizLiveMonitor render path (which does a switch over
      // 'percent' | 'count' | 'hidden' and would pick a no-op branch). The
      // guard must drop unknown values and fall back to the default.
      await mountWithProfile({
        quizMonitorScoreDisplay: 'foobar',
      });

      expect(getCtx().quizMonitorScoreDisplay).toBe('percent');
      // colorsEnabled was absent — still defaults true.
      expect(getCtx().quizMonitorColorsEnabled).toBe(true);
    });
  });

  describe('updateAccountPreferences', () => {
    it('writes a sanitized payload — only the requested field, with merge:true', async () => {
      await mountWithProfile({
        quizMonitorColorsEnabled: true,
        quizMonitorScoreDisplay: 'percent',
      });

      // Clear any setDoc calls from the root-doc-sync effect that fires on
      // profileLoaded, so the assertion below only sees the write under test.
      vi.mocked(firestore.setDoc).mockClear();

      await act(async () => {
        await getCtx().updateAccountPreferences({
          quizMonitorScoreDisplay: 'hidden',
        });
      });

      // Filter to the profile-doc writes only — root-doc syncs go to a
      // different path and aren't part of this contract.
      const profileWrites = vi
        .mocked(firestore.setDoc)
        .mock.calls.filter(([ref]) =>
          (ref as unknown as DocRef).__path?.endsWith('userProfile/profile')
        );

      expect(profileWrites).toHaveLength(1);
      const [, payload, options] = profileWrites[0];
      // Exact-match payload — guards against stale-prior-payload bleed-through
      // and unrelated-key contamination. Firestore would also reject any
      // `undefined` field values, hence the strict equality.
      expect(payload).toEqual({ quizMonitorScoreDisplay: 'hidden' });
      expect(options).toEqual({ merge: true });
    });

    it('does not bleed the previous call into the next call', async () => {
      await mountWithProfile(null);

      vi.mocked(firestore.setDoc).mockClear();

      await act(async () => {
        await getCtx().updateAccountPreferences({
          quizMonitorColorsEnabled: false,
        });
      });
      await act(async () => {
        await getCtx().updateAccountPreferences({
          quizMonitorScoreDisplay: 'count',
        });
      });

      const profileWrites = vi
        .mocked(firestore.setDoc)
        .mock.calls.filter(([ref]) =>
          (ref as unknown as DocRef).__path?.endsWith('userProfile/profile')
        );

      expect(profileWrites).toHaveLength(2);
      expect(profileWrites[0][1]).toEqual({ quizMonitorColorsEnabled: false });
      // Second payload must not carry the first call's quizMonitorColorsEnabled.
      expect(profileWrites[1][1]).toEqual({ quizMonitorScoreDisplay: 'count' });
    });

    it('applies the optimistic state update before setDoc resolves', async () => {
      await mountWithProfile({
        quizMonitorColorsEnabled: true,
      });

      // Default starting state for this profile is colorsEnabled=true.
      expect(getCtx().quizMonitorColorsEnabled).toBe(true);

      // Suspend the next setDoc so we can observe state between the local
      // setState and the network round-trip resolving.
      let resolveSetDoc: () => void = () => undefined;
      const pending = new Promise<void>((resolve) => {
        resolveSetDoc = resolve;
      });
      vi.mocked(firestore.setDoc).mockReturnValueOnce(pending);

      let pendingCall: Promise<void> = Promise.resolve();
      // Synchronous act flushes the React state updates that fire before
      // the function reaches its first `await`. The returned promise
      // remains pending because setDoc never resolved.
      act(() => {
        pendingCall = getCtx().updateAccountPreferences({
          quizMonitorColorsEnabled: false,
        });
      });

      // Optimistic update should already be visible to consumers — this is
      // the contract QuizLiveMonitor's toggle handler relies on (UI flips
      // immediately, then a toast fires only on rejection).
      expect(getCtx().quizMonitorColorsEnabled).toBe(false);

      // Drain the pending promise so the test doesn't leak microtasks.
      resolveSetDoc();
      await act(async () => {
        await pendingCall;
      });
    });

    it('rejects when setDoc rejects so callers can render a toast', async () => {
      await mountWithProfile(null);

      const failure = new Error('quota exceeded');
      vi.mocked(firestore.setDoc).mockRejectedValueOnce(failure);

      // The QuizLiveMonitor toggle handlers attach `.catch(...)` and depend
      // on the rejection actually propagating. If updateAccountPreferences
      // swallowed the error internally, this assertion would fail and the
      // toast would be dead code.
      await expect(
        act(async () => {
          await getCtx().updateAccountPreferences({
            quizMonitorColorsEnabled: false,
          });
        })
      ).rejects.toBe(failure);
    });
  });
});

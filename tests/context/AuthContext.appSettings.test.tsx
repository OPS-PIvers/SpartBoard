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
import type { AppSettings, ResultsProtection } from '@/types';

/**
 * Tests for `updateAppSettings` persistence of the `lastResultsProtection`
 * field added to AppSettings for the quiz results-protection feature.
 *
 * The expectation is that `updateAppSettings` is a generic `Partial<AppSettings>`
 * Firestore merge — it does NOT have a per-field allowlist — so once
 * `lastResultsProtection` is added to the type it flows through with zero
 * additional code changes. This test pins that contract:
 *
 *   1. The Firestore write fires against `admin_settings/app_settings`
 *      with `merge: true` and a payload containing only the supplied field.
 *   2. The onSnapshot-driven appSettings state surfaces the new field
 *      to consumers without clobbering pre-existing fields like
 *      `geminiDailyLimit`.
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
  query: vi.fn((collectionRef: unknown) => collectionRef),
  limit: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
}));

interface DocRef {
  __path: string;
}

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

function buildFakeUser(uid = 'test-uid', email = 'admin@example.com'): User {
  return {
    uid,
    email,
    displayName: 'Admin',
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
type QuerySnap = Awaited<ReturnType<typeof firestore.getDocs>>;

/**
 * Sets up Firestore mocks so the mounted user resolves as an admin (which is
 * the gate `updateAppSettings` enforces) and the app_settings onSnapshot
 * subscription delivers a seeded AppSettings doc that we can drive updates
 * through.
 *
 * Returns the captured app_settings snapshot callback so the test can simulate
 * Firestore echoing the merge back to the client.
 */
function installAdminFirestore(initialAppSettings: AppSettings): {
  pushAppSettings: (data: AppSettings) => void;
} {
  // /admins/{email} must exist for isAdmin to resolve true. Profile and the
  // root /users/{uid} doc are fine as non-existent — those paths only affect
  // the setup-wizard heuristic, which is irrelevant here.
  vi.mocked(firestore.getDoc).mockImplementation((ref) => {
    const path = (ref as unknown as DocRef).__path ?? '';
    if (path.startsWith('admins/')) {
      return Promise.resolve({
        exists: () => true,
        data: () => ({}),
      } as unknown as DocSnap);
    }
    return Promise.resolve({
      exists: () => false,
      data: () => undefined,
    } as unknown as DocSnap);
  });

  vi.mocked(firestore.getDocs).mockResolvedValue({
    empty: true,
    size: 0,
  } as unknown as QuerySnap);

  // Capture the app_settings snapshot listener so we can drive it from the
  // test (initial delivery + a post-write echo). Other onSnapshot subscriptions
  // (user_roles, members, org buildings, feature_permissions, etc.) are no-ops.
  let appSettingsListener: ((snap: unknown) => void) | null = null;
  vi.mocked(firestore.onSnapshot).mockImplementation(
    (refOrQuery: unknown, ...rest: unknown[]) => {
      const path = (refOrQuery as DocRef).__path ?? '';
      if (path === 'admin_settings/app_settings') {
        appSettingsListener = rest[0] as (snap: unknown) => void;
        // Deliver the seed asynchronously so the calling effect's setup
        // completes first. The `void` makes the intentionally-fire-and-forget
        // promise explicit (eslint no-floating-promises would flag it otherwise).
        void Promise.resolve().then(() => {
          if (appSettingsListener) {
            appSettingsListener({
              exists: () => true,
              data: () => initialAppSettings,
            });
          }
        });
      }
      return () => undefined;
    }
  );

  return {
    pushAppSettings: (data: AppSettings): void => {
      if (!appSettingsListener) {
        throw new Error(
          'app_settings onSnapshot listener never registered — admin gate may not have opened'
        );
      }
      appSettingsListener({
        exists: () => true,
        data: () => data,
      });
    },
  };
}

async function mountAsAdmin(
  initialAppSettings: AppSettings
): Promise<{ pushAppSettings: (data: AppSettings) => void }> {
  ctxHolder.current = null;
  const handle = installAdminFirestore(initialAppSettings);

  const onAuthMock = vi.mocked(firebaseAuth.onAuthStateChanged);
  onAuthMock.mockImplementation(() => () => undefined);

  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

  const lastCall = onAuthMock.mock.calls[onAuthMock.mock.calls.length - 1];
  if (!lastCall) {
    throw new Error(
      'onAuthStateChanged was never called — provider failed to mount'
    );
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

  // Wait for the admin check + app_settings snapshot delivery to settle.
  // Once isAdmin === true the app_settings listener attaches and the initial
  // snapshot we queued in `installAdminFirestore` flushes through.
  await waitFor(() => {
    expect(ctxHolder.current?.isAdmin).toBe(true);
    expect(ctxHolder.current?.appSettings?.geminiDailyLimit).toBe(
      initialAppSettings.geminiDailyLimit
    );
  });

  return handle;
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
  window.localStorage.clear();
  vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
});

describe('AuthContext — updateAppSettings with lastResultsProtection', () => {
  it('persists lastResultsProtection through the generic Partial<AppSettings> merge', async () => {
    const { pushAppSettings } = await mountAsAdmin({
      geminiDailyLimit: 50,
    });

    // No app_settings writes from provider hydration — only the one we drive
    // below should appear in the assertion.
    vi.mocked(firestore.setDoc).mockClear();

    const protection: ResultsProtection = {
      watermarkEnabled: true,
      tabWarningEnabled: true,
      tabWarningThreshold: 5,
    };

    await act(async () => {
      await getCtx().updateAppSettings({ lastResultsProtection: protection });
    });

    // The write must target admin_settings/app_settings with merge:true and a
    // payload containing only the new field. If a per-field allowlist ever
    // sneaks in, this assertion fails because the payload arg won't match.
    const appSettingsWrites = vi
      .mocked(firestore.setDoc)
      .mock.calls.filter(
        ([ref]) =>
          (ref as unknown as DocRef).__path === 'admin_settings/app_settings'
      );

    expect(appSettingsWrites).toHaveLength(1);
    const [, payload, options] = appSettingsWrites[0];
    expect(payload).toEqual({ lastResultsProtection: protection });
    expect(options).toEqual({ merge: true });

    // Simulate Firestore's merged echo so the onSnapshot listener fires the
    // way it would in production: geminiDailyLimit preserved + new field
    // surfaced. This is what consumers (the publish-dialog pre-fill) read.
    act(() => {
      pushAppSettings({
        geminiDailyLimit: 50,
        lastResultsProtection: protection,
      });
    });

    await waitFor(() => {
      expect(getCtx().appSettings?.lastResultsProtection).toEqual(protection);
      // Pre-existing field must still be present — guards against an
      // accidental setAppSettings(updates) instead of the snapshot-driven
      // merge.
      expect(getCtx().appSettings?.geminiDailyLimit).toBe(50);
    });
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import * as firebaseAuth from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/useAuth';
import type { AuthContextType } from '@/context/AuthContextValue';

/**
 * Locks the background Drive-token lifecycle in AuthContext. The per-minute
 * expiry check used to CLEAR an expired token and then stop (no expiry key →
 * early return), so a laptop that slept through the refresh window woke to a
 * permanent "Drive Disconnected" banner. It must now refresh on expiry, keep
 * retrying on a backoff while disconnected, and re-check on focus/wake.
 * Mocks mirror tests/context/AuthContext.gisRefreshErrors.test.tsx.
 */

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

vi.mock('@/utils/googleOAuthRefresh', () => ({
  refreshAccessTokenViaBackend: vi
    .fn()
    .mockResolvedValue({ status: 'error', message: 'test-no-backend' }),
  requestAndExchangeAuthCode: vi.fn(),
  revokeBackendRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

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
  getDoc: vi
    .fn()
    .mockResolvedValue({ exists: () => false, data: () => undefined }),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => undefined),
  limit: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
}));

const TOKEN_KEY = 'spart_google_access_token';
const EXPIRY_KEY = 'spart_google_token_expiry';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const ctxHolder: { current: AuthContextType | null } = { current: null };

const Probe: React.FC = () => {
  const ctx = useAuth();
  React.useEffect(() => {
    ctxHolder.current = ctx;
  });
  return null;
};

function getCtx(): AuthContextType {
  if (!ctxHolder.current) throw new Error('AuthContext never captured');
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

// GIS stub whose outcome is decided per call so a test can fail the
// pre-expiry attempts and succeed only afterwards.
const requestAccessToken = vi.fn();
function stubGis(shouldSucceed: () => boolean): void {
  requestAccessToken.mockReset();
  const initTokenClient = vi.fn(
    (config: {
      callback: (r: { access_token?: string; expires_in?: string }) => void;
      error_callback: () => void;
    }) => ({
      requestAccessToken: (...args: unknown[]) => {
        requestAccessToken(...args);
        if (shouldSucceed()) {
          config.callback({ access_token: 'fresh-token', expires_in: '3600' });
        } else {
          config.error_callback();
        }
      },
    })
  );
  vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } });
}

async function mountSignedIn(): Promise<void> {
  ctxHolder.current = null;
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
  const user = buildFakeUser('teacher@example.com');
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    writable: true,
    value: user,
  });
  await act(async () => {
    listener(user);
    await Promise.resolve();
  });
  expect(ctxHolder.current).not.toBeNull();
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function seedToken(expiresInMs: number): void {
  localStorage.setItem(TOKEN_KEY, 'stored-token');
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresInMs));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-04T08:00:00Z'));
  vi.stubEnv(
    'VITE_GOOGLE_CLIENT_ID',
    'test-client-id.apps.googleusercontent.com'
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AuthContext — Drive token expiry lifecycle', () => {
  it('refreshes after expiry instead of clearing the token for good', async () => {
    const expiresAt = Date.now() + 2 * HOUR;
    seedToken(2 * HOUR);
    // Every pre-expiry attempt fails (e.g. flaky network); the first attempt
    // after expiry succeeds.
    stubGis(() => Date.now() > expiresAt);
    await mountSignedIn();
    expect(getCtx().googleAccessToken).toBe('stored-token');

    await advance(2 * HOUR + MINUTE);

    expect(getCtx().googleAccessToken).toBe('fresh-token');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('fresh-token');
  });

  it('clears an expired token only when the silent refresh fails', async () => {
    seedToken(2 * HOUR);
    stubGis(() => false);
    await mountSignedIn();

    await advance(2 * HOUR + MINUTE);

    expect(getCtx().googleAccessToken).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(EXPIRY_KEY)).toBeNull();
  });

  it('keeps retrying on a backoff while disconnected', async () => {
    stubGis(() => false);
    await mountSignedIn();
    // Startup GIS poll fires the first attempt.
    await advance(MINUTE);
    const afterFirstMinute = requestAccessToken.mock.calls.length;
    expect(afterFirstMinute).toBeGreaterThanOrEqual(1);

    await advance(3 * MINUTE);
    expect(requestAccessToken.mock.calls.length).toBe(afterFirstMinute);

    await advance(3 * MINUTE);
    expect(requestAccessToken.mock.calls.length).toBe(afterFirstMinute + 1);
  });

  it('re-checks on focus after a sleep that skipped the interval ticks', async () => {
    seedToken(2 * HOUR);
    stubGis(() => true);
    await mountSignedIn();
    expect(requestAccessToken).not.toHaveBeenCalled();

    // A sleeping laptop advances the clock without firing any timers.
    vi.setSystemTime(Date.now() + 3 * HOUR);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    expect(requestAccessToken).toHaveBeenCalledTimes(1);
    expect(getCtx().googleAccessToken).toBe('fresh-token');
  });
});

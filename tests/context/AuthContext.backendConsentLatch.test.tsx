import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import * as firebaseAuth from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/useAuth';
import type { AuthContextType } from '@/context/AuthContextValue';
import {
  refreshAccessTokenViaBackend,
  requestAndExchangeAuthCode,
} from '@/utils/googleOAuthRefresh';

// Locks the per-user backend needs-consent latch that bounds the silent refresh loop.

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

vi.mock('@/utils/googleOAuthRefresh', () => ({
  refreshAccessTokenViaBackend: vi.fn(),
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
const PROBED_KEY = 'spart_offline_grant_probed';
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

function buildFakeUser(email: string, uid = 'test-uid'): User {
  return {
    uid,
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

const requestAccessToken = vi.fn();
let gisSucceeds = false;
function stubGis(): void {
  const initTokenClient = vi.fn(
    (config: {
      callback: (r: { access_token?: string; expires_in?: string }) => void;
      error_callback: () => void;
    }) => ({
      requestAccessToken: (...args: unknown[]) => {
        requestAccessToken(...args);
        if (gisSucceeds) {
          config.callback({ access_token: 'gis-token', expires_in: '3600' });
        } else {
          config.error_callback();
        }
      },
    })
  );
  vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } });
}

const backend = vi.mocked(refreshAccessTokenViaBackend);
const exchange = vi.mocked(requestAndExchangeAuthCode);
let authListener: ((u: User | null) => void) | null = null;

async function emitUser(user: User | null): Promise<void> {
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    writable: true,
    value: user,
  });
  await act(async () => {
    authListener?.(user);
    await Promise.resolve();
  });
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
  authListener = lastCall[1] as (u: User | null) => void;
  await emitUser(buildFakeUser('teacher@example.com'));
  expect(ctxHolder.current).not.toBeNull();
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function fire(event: Event): Promise<void> {
  await act(async () => {
    window.dispatchEvent(event);
    await vi.advanceTimersByTimeAsync(0);
  });
}

// GIS fails and the backend says needs-consent, so the startup refresh latches.
async function mountLatched(): Promise<void> {
  backend.mockResolvedValue({ status: 'needs-consent', cause: 'no-token' });
  await mountSignedIn();
  await advance(MINUTE);
  expect(backend).toHaveBeenCalledTimes(1);
}

function dropToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

let hiddenSpy: { mockRestore: () => void } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  gisSucceeds = false;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T08:00:00Z'));
  vi.stubEnv(
    'VITE_GOOGLE_CLIENT_ID',
    'test-client-id.apps.googleusercontent.com'
  );
  stubGis();
});

afterEach(() => {
  hiddenSpy?.mockRestore();
  hiddenSpy = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AuthContext — backend needs-consent latch', () => {
  it('bounds backend calls to one while silent GIS retries keep running', async () => {
    await mountLatched();
    const gisCallsAfterLatch = requestAccessToken.mock.calls.length;

    await advance(3 * HOUR);

    expect(backend).toHaveBeenCalledTimes(1);
    // 5-minute silent GIS retries continue (~36 over 3h).
    expect(requestAccessToken.mock.calls.length).toBeGreaterThan(
      gisCallsAfterLatch + 30
    );
  });

  it('keeps silent GIS retries running in a hidden tab', async () => {
    await mountLatched();
    hiddenSpy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    gisSucceeds = true;
    sessionStorage.setItem(PROBED_KEY, '1');

    await advance(6 * MINUTE);

    expect(getCtx().googleAccessToken).toBe('gis-token');
    expect(backend).toHaveBeenCalledTimes(1);
  });

  it('keeps the pre-expiry refresh for a stored token', async () => {
    await mountLatched();
    gisSucceeds = true;
    await advance(6 * MINUTE);
    expect(getCtx().googleAccessToken).toBe('gis-token');
    const gisCalls = requestAccessToken.mock.calls.length;

    // Inside the 10-minute pre-expiry window GIS is asked again.
    await advance(52 * MINUTE);
    expect(requestAccessToken.mock.calls.length).toBeGreaterThan(gisCalls);
  });

  it('allows one throttled backend attempt on focus', async () => {
    await mountLatched();

    // Within the 30-minute throttle a focus does not reach the backend.
    await advance(10 * MINUTE);
    await fire(new Event('focus'));
    await advance(10 * MINUTE);
    expect(backend).toHaveBeenCalledTimes(1);

    // Past the throttle, focus triggers exactly one attempt right away.
    await advance(15 * MINUTE);
    await fire(new Event('focus'));
    expect(backend).toHaveBeenCalledTimes(2);

    // That attempt re-latched: no retry from ticks or an immediate focus.
    await fire(new Event('focus'));
    await advance(20 * MINUTE);
    expect(backend).toHaveBeenCalledTimes(2);
  });

  it('does not grant a backend attempt to ticks without a focus', async () => {
    await mountLatched();
    await advance(2 * HOUR);
    expect(backend).toHaveBeenCalledTimes(1);
  });

  it('refreshes from the backend when a focus attempt succeeds', async () => {
    await mountLatched();
    await advance(31 * MINUTE);
    backend.mockResolvedValue({
      status: 'ok',
      token: 'backend-token',
      expiresIn: 3600,
    });
    await fire(new Event('focus'));
    await advance(6 * MINUTE);

    expect(getCtx().googleAccessToken).toBe('backend-token');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('backend-token');
  });

  it('refreshes from the backend on the happy path without latching', async () => {
    backend.mockResolvedValue({
      status: 'ok',
      token: 'backend-token',
      expiresIn: 3600,
    });
    await mountSignedIn();
    await advance(MINUTE);
    expect(getCtx().googleAccessToken).toBe('backend-token');

    // Expiring again reaches the backend again: nothing latched.
    await advance(52 * MINUTE);
    expect(backend.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('clears the latch when another tab writes a fresh token', async () => {
    await mountLatched();

    await fire(
      new StorageEvent('storage', { key: TOKEN_KEY, newValue: 'other-tab' })
    );
    await advance(6 * MINUTE);

    expect(backend).toHaveBeenCalledTimes(2);
  });

  it('ignores storage events for other keys or token removal', async () => {
    await mountLatched();

    await fire(
      new StorageEvent('storage', { key: 'unrelated', newValue: 'x' })
    );
    await fire(new StorageEvent('storage', { key: TOKEN_KEY, newValue: null }));
    await advance(20 * MINUTE);

    expect(backend).toHaveBeenCalledTimes(1);
  });

  it('still reaches the interactive path while latched; the exchange clears the latch', async () => {
    await mountLatched();
    sessionStorage.setItem(PROBED_KEY, '1');
    exchange.mockResolvedValue({
      kind: 'success',
      result: {
        accessToken: 'exchanged-token',
        expiresIn: 3600,
        hasRefreshToken: true,
      },
    });

    let token: string | null = null;
    await act(async () => {
      token = await getCtx().refreshGoogleToken(false);
    });
    expect(token).toBe('exchanged-token');
    expect(backend).toHaveBeenCalledTimes(2);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(firebaseAuth.signOut).not.toHaveBeenCalled();

    // Once the token is gone the next silent retry asks the backend again.
    dropToken();
    await advance(6 * MINUTE);
    expect(backend).toHaveBeenCalledTimes(3);
  });

  it('clears the latch when captureOfflineGrant succeeds', async () => {
    await mountLatched();
    exchange.mockResolvedValue({
      kind: 'success',
      result: {
        accessToken: 'grant-token',
        expiresIn: 3600,
        hasRefreshToken: true,
      },
    });
    await act(async () => {
      await getCtx().captureOfflineGrant();
    });
    const before = backend.mock.calls.length;

    dropToken();
    await advance(6 * MINUTE);
    expect(backend.mock.calls.length).toBeGreaterThan(before);
  });

  it('resets the latch when the signed-in user changes', async () => {
    await mountLatched();

    await emitUser(buildFakeUser('other@example.com', 'other-uid'));
    await advance(MINUTE);

    expect(backend).toHaveBeenCalledTimes(2);
  });

  it('resets the latch on sign-out and sign-in of the same user', async () => {
    await mountLatched();

    await act(async () => {
      await getCtx().signOut();
    });
    await emitUser(null);
    await emitUser(buildFakeUser('teacher@example.com'));
    await advance(MINUTE);

    expect(backend).toHaveBeenCalledTimes(2);
  });

  it('does not block the offline-grant probe behind DriveOfflineGrantCard', async () => {
    await mountLatched();
    gisSucceeds = true;

    await advance(6 * MINUTE);

    expect(getCtx().googleAccessToken).toBe('gis-token');
    expect(backend).toHaveBeenCalledTimes(2);
    expect(getCtx().offlineGrantMissing).toBe(true);
  });
});

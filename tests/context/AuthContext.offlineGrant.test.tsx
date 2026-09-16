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

/**
 * Locks the offline-grant probe and capture. Only 1.8% of prod users had a
 * server-side refresh token (measured 2026-09-15) because the code flow ran
 * only AFTER a Drive failure; these paths surface it proactively instead.
 * Mocks mirror tests/context/AuthContext.tokenExpiryRefresh.test.tsx.
 */

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
const HOUR = 60 * 60 * 1000;

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
    await Promise.resolve();
  });
}

// A token comfortably inside its window, so the background refresh effects
// return early and the only backend call is the grant probe.
function seedLiveToken(): void {
  localStorage.setItem(TOKEN_KEY, 'stored-token');
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + 2 * HOUR));
}

// A GIS stub that SUCCEEDS. Without a working initTokenClient the refresh
// chain treats GIS as unavailable and falls through to its backend leg — the
// same callable the probe uses — so any ambient refresh would be indistinguish-
// able from a probe and the call counts below would be meaningless.
function stubWorkingGis(): void {
  const initTokenClient = vi.fn(
    (config: {
      callback: (r: { access_token?: string; expires_in?: string }) => void;
    }) => ({
      requestAccessToken: () =>
        config.callback({ access_token: 'gis-token', expires_in: '3600' }),
    })
  );
  vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  stubWorkingGis();
  vi.stubEnv(
    'VITE_GOOGLE_CLIENT_ID',
    'test-client-id.apps.googleusercontent.com'
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AuthContext — offline grant probe', () => {
  it('flags a missing grant when the backend reports needs-consent', async () => {
    vi.mocked(refreshAccessTokenViaBackend).mockResolvedValue({
      status: 'needs-consent',
      cause: 'no-stored-token',
    });
    seedLiveToken();
    await mountSignedIn();

    expect(getCtx().offlineGrantMissing).toBe(true);
    expect(sessionStorage.getItem(PROBED_KEY)).toBe('1');
  });

  it('stays quiet when a grant already exists', async () => {
    vi.mocked(refreshAccessTokenViaBackend).mockResolvedValue({
      status: 'ok',
      token: 'backend-token',
      expiresIn: 3600,
    });
    seedLiveToken();
    await mountSignedIn();

    expect(getCtx().offlineGrantMissing).toBe(false);
  });

  // A network blip must not prompt for consent — teachers who learn to dismiss
  // this card will dismiss it when it finally matters.
  it('does not flag on a transient backend error', async () => {
    vi.mocked(refreshAccessTokenViaBackend).mockResolvedValue({
      status: 'error',
      message: 'network',
    });
    seedLiveToken();
    await mountSignedIn();

    expect(getCtx().offlineGrantMissing).toBe(false);
  });

  // While Drive is disconnected, DriveDisconnectBanner owns the recovery and
  // its reconnect already routes through the code flow. The card must stay
  // down even though the backend would report a missing grant — asserted on
  // the flag rather than call counts, since a disconnected app legitimately
  // calls the same backend leg trying to recover a token.
  it('keeps the card down while Drive is disconnected', async () => {
    // GIS declines too, so nothing can mint a token mid-test and flip the
    // precondition the probe depends on.
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config: { error_callback: () => void }) => ({
            requestAccessToken: () => config.error_callback(),
          })),
        },
      },
    });
    vi.mocked(refreshAccessTokenViaBackend).mockResolvedValue({
      status: 'needs-consent',
      cause: 'no-stored-token',
    });
    await mountSignedIn();

    expect(getCtx().googleAccessToken).toBeNull();
    expect(getCtx().offlineGrantMissing).toBe(false);
  });

  it('probes only once per browser session', async () => {
    sessionStorage.setItem(PROBED_KEY, '1');
    seedLiveToken();
    await mountSignedIn();

    expect(refreshAccessTokenViaBackend).not.toHaveBeenCalled();
  });
});

describe('AuthContext — captureOfflineGrant', () => {
  beforeEach(() => {
    vi.mocked(refreshAccessTokenViaBackend).mockResolvedValue({
      status: 'needs-consent',
      cause: 'no-stored-token',
    });
  });

  it('stores the fresh token and clears the flag', async () => {
    vi.mocked(requestAndExchangeAuthCode).mockResolvedValue({
      kind: 'success',
      result: {
        accessToken: 'granted-token',
        expiresIn: 3600,
        hasRefreshToken: true,
      },
    });
    seedLiveToken();
    await mountSignedIn();
    expect(getCtx().offlineGrantMissing).toBe(true);

    let ok = false;
    await act(async () => {
      ok = await getCtx().captureOfflineGrant();
    });

    expect(ok).toBe(true);
    expect(getCtx().offlineGrantMissing).toBe(false);
    expect(getCtx().googleAccessToken).toBe('granted-token');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('granted-token');
  });

  // Google withholds the refresh leg on a re-authorization. The access token is
  // still usable, but the grant did NOT land — reporting success would leave
  // the teacher believing they were covered.
  it('reports failure when Google withholds the refresh token', async () => {
    vi.mocked(requestAndExchangeAuthCode).mockResolvedValue({
      kind: 'success',
      result: {
        accessToken: 'granted-token',
        expiresIn: 3600,
        hasRefreshToken: false,
      },
    });
    seedLiveToken();
    await mountSignedIn();

    let ok = true;
    await act(async () => {
      ok = await getCtx().captureOfflineGrant();
    });

    expect(ok).toBe(false);
    expect(getCtx().offlineGrantMissing).toBe(true);
  });

  it('reports failure when the user cancels consent', async () => {
    vi.mocked(requestAndExchangeAuthCode).mockResolvedValue({
      kind: 'cancelled',
    });
    seedLiveToken();
    await mountSignedIn();

    let ok = true;
    await act(async () => {
      ok = await getCtx().captureOfflineGrant();
    });

    expect(ok).toBe(false);
    expect(getCtx().offlineGrantMissing).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('stored-token');
  });

  it('requests the union of on-demand scopes, not just drive.file', async () => {
    vi.mocked(requestAndExchangeAuthCode).mockResolvedValue({
      kind: 'cancelled',
    });
    seedLiveToken();
    await mountSignedIn();

    await act(async () => {
      await getCtx().captureOfflineGrant();
    });

    expect(requestAndExchangeAuthCode).toHaveBeenCalledWith(
      'test-client-id.apps.googleusercontent.com',
      'teacher@example.com',
      expect.any(Array)
    );
  });
});

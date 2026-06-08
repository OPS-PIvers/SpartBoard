import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import * as firebaseAuth from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/useAuth';
import type { AuthContextType } from '@/context/AuthContextValue';
import { logError } from '@/utils/logError';
import { refreshAccessTokenViaBackend } from '@/utils/googleOAuthRefresh';

/**
 * Locks the GIS error differentiation in `refreshGoogleToken`. The silent
 * refresh chain tries the GIS token client first; when it fails it must log a
 * DISTINCT, actionable signal depending on WHY it failed — a consent re-prompt
 * (`gisDenied`, fired via GIS `error_callback`) vs a broken/absent GIS
 * environment (`gisUnavailable`, e.g. a null tokenClient). Both previously
 * collapsed to a bare `null`. The control flow is unchanged in either case:
 * the chain falls through to the backend refresh, which we force to fail so the
 * overall result is `null`.
 */

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

// Force the backend refresh (the step AFTER GIS in the chain) to a benign
// failure so the chain always returns null regardless of the GIS outcome —
// isolating the GIS logging branch under test.
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

/**
 * Stub the GIS token client. `mode` selects which outcome the client produces:
 *   - 'denied'      → fires `error_callback` (re-consent needed)
 *   - 'null-client' → `initTokenClient` returns undefined (GIS not ready)
 *   - 'empty'       → callback fires with no `access_token`
 */
function stubGis(mode: 'denied' | 'null-client' | 'empty'): void {
  const initTokenClient = vi.fn(
    (config: {
      callback: (r: { access_token?: string; expires_in?: string }) => void;
      error_callback: () => void;
    }) => {
      if (mode === 'null-client') return undefined;
      return {
        requestAccessToken: () => {
          if (mode === 'denied') {
            config.error_callback();
          } else {
            // 'empty' — a malformed 200 with no token
            config.callback({});
          }
        },
      };
    }
  );
  vi.stubGlobal('google', {
    accounts: { oauth2: { initTokenClient } },
  });
}

async function mountSignedIn(email: string): Promise<void> {
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
  const user = buildFakeUser(email);
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    writable: true,
    value: user,
  });
  act(() => {
    listener(user);
  });

  await waitFor(() => {
    expect(ctxHolder.current).not.toBeNull();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxHolder.current = null;
  // The chain only reaches the GIS branch when a client id is configured.
  vi.stubEnv(
    'VITE_GOOGLE_CLIENT_ID',
    'test-client-id.apps.googleusercontent.com'
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AuthContext — refreshGoogleToken GIS error differentiation', () => {
  it('logs `gisDenied` when GIS fires error_callback (re-consent needed)', async () => {
    stubGis('denied');
    await mountSignedIn('teacher@example.com');

    let token: string | null = 'sentinel';
    await act(async () => {
      token = await getCtx().refreshGoogleToken(true);
    });

    // Backend is forced to fail, so the overall result is still null —
    // behavior preserved.
    expect(token).toBeNull();

    const scopes = vi.mocked(logError).mock.calls.map((c) => c[0]);
    expect(scopes).toContain('AuthContext.refreshGoogleToken.gisDenied');
    expect(scopes).not.toContain(
      'AuthContext.refreshGoogleToken.gisUnavailable'
    );
  });

  it('logs `gisUnavailable` when the token client is null (GIS not initialized)', async () => {
    stubGis('null-client');
    await mountSignedIn('teacher@example.com');

    let token: string | null = 'sentinel';
    await act(async () => {
      token = await getCtx().refreshGoogleToken(true);
    });

    expect(token).toBeNull();

    const calls = vi.mocked(logError).mock.calls;
    const unavailable = calls.find(
      (c) => c[0] === 'AuthContext.refreshGoogleToken.gisUnavailable'
    );
    expect(unavailable).toBeDefined();
    // The reason string carries the actionable discriminator.
    expect(String((unavailable?.[1] as Error)?.message)).toContain(
      'null-token-client'
    );
    expect(calls.map((c) => c[0])).not.toContain(
      'AuthContext.refreshGoogleToken.gisDenied'
    );
  });

  it('logs `gisUnavailable` for a malformed empty token response', async () => {
    stubGis('empty');
    await mountSignedIn('teacher@example.com');

    await act(async () => {
      await getCtx().refreshGoogleToken(true);
    });

    const calls = vi.mocked(logError).mock.calls;
    const unavailable = calls.find(
      (c) => c[0] === 'AuthContext.refreshGoogleToken.gisUnavailable'
    );
    expect(unavailable).toBeDefined();
    expect(String((unavailable?.[1] as Error)?.message)).toContain(
      'empty-token-response'
    );
  });

  it('still falls through to the backend refresh after a GIS failure', async () => {
    stubGis('denied');
    await mountSignedIn('teacher@example.com');

    await act(async () => {
      await getCtx().refreshGoogleToken(true);
    });

    // Control flow is unchanged: the backend step runs regardless of which
    // GIS failure occurred.
    expect(vi.mocked(refreshAccessTokenViaBackend)).toHaveBeenCalled();
  });
});

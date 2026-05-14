/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-non-null-assertion -- mock handlers
   intentionally return Promise-shaped values without awaiting, and we use
   non-null assertions on lastCodeClientConfig once the GIS init() has
   captured it. */
/**
 * Tests for the client-side glue that drives the server refresh-token flow.
 *
 * Critical behaviors covered:
 * - Discriminated `AuthCodeOutcome` distinguishes user-cancel from real error
 * - GIS load race waits for the script rather than failing immediately
 * - Backend `needs-consent` is read from structured `details.reason`, not a
 *   message string match
 * - `no-token-in-response` and arbitrary backend errors emit `logError`
 *   so ops sees regressions
 * - `revokeBackendRefreshToken` throws on backend failure so the sidebar
 *   can surface a truthful disconnect signal
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture logError calls for assertion.
const loggedErrors: { scope: string; error: unknown }[] = [];
vi.mock('@/utils/logError', () => ({
  logError: (scope: string, error: unknown) => {
    loggedErrors.push({ scope, error });
  },
}));

// Mock @/config/firebase. Factory body is hoisted, so any state it
// references has to be allocated inside.
vi.mock('@/config/firebase', () => {
  const state = { isAuthBypass: false };
  // Expose mutation through a side-channel global so tests can flip
  // `isAuthBypass` between cases.
  (
    globalThis as { __firebaseMockState?: { isAuthBypass: boolean } }
  ).__firebaseMockState = state;
  return {
    functions: {},
    get isAuthBypass() {
      return state.isAuthBypass;
    },
    GOOGLE_OAUTH_SCOPES: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  };
});

const setIsAuthBypass = (v: boolean) => {
  const state = (
    globalThis as { __firebaseMockState?: { isAuthBypass: boolean } }
  ).__firebaseMockState;
  if (state) state.isAuthBypass = v;
};

// Mock firebase/functions. Factory is hoisted, so the callable registry
// + FunctionsError class live inside it; tests reach them via a global
// side-channel.
type Callable = (data?: unknown) => Promise<{ data: unknown }>;

vi.mock('firebase/functions', () => {
  const callables = new Map<string, Callable>();
  class FunctionsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = 'FunctionsError';
    }
  }
  (globalThis as { __callablesMock?: Map<string, Callable> }).__callablesMock =
    callables;
  (globalThis as { __FunctionsError?: unknown }).__FunctionsError =
    FunctionsError;
  return {
    httpsCallable: (_functions: unknown, name: string) => {
      return (data: unknown) => {
        const h = callables.get(name);
        if (!h) throw new Error(`No callable mock registered for "${name}"`);
        return h(data);
      };
    },
    FunctionsError,
  };
});

const callableHandlers = (
  globalThis as { __callablesMock?: Map<string, Callable> }
).__callablesMock as Map<string, Callable>;
const setCallable = (name: string, handler: Callable) => {
  callableHandlers.set(name, handler);
};

type FunctionsErrorCtor = new (
  code: string,
  message: string,
  details?: unknown
) => Error & { code: string; details?: unknown };
const FunctionsError = (globalThis as { __FunctionsError?: FunctionsErrorCtor })
  .__FunctionsError as FunctionsErrorCtor;

import {
  requestAndExchangeAuthCode,
  refreshAccessTokenViaBackend,
  revokeBackendRefreshToken,
} from '@/utils/googleOAuthRefresh';

// GIS shim — install on `window.google` as the module's `ensureGis` poll
// expects. Tests that want the "GIS never loads" path can leave it absent.
type CodeClientCallback = (response: { code?: string; error?: string }) => void;
type ErrorCallback = (err: unknown) => void;
interface FakeCodeClientConfig {
  callback: CodeClientCallback;
  error_callback?: ErrorCallback;
}
let lastCodeClientConfig: FakeCodeClientConfig | null = null;

function installGis(): void {
  const g = globalThis as unknown as { window?: Record<string, unknown> };
  g.window = g.window ?? {};
  const win = g.window;
  win.google = {
    accounts: {
      oauth2: {
        initCodeClient: (cfg: FakeCodeClientConfig) => {
          lastCodeClientConfig = cfg;
          return {
            requestCode: () => {
              // Tests drive responses by calling cfg.callback or
              // cfg.error_callback manually after the promise is set up.
            },
          };
        },
      },
    },
  };
}

function uninstallGis(): void {
  const win = (globalThis as unknown as { window?: Record<string, unknown> })
    .window;
  if (win) delete win.google;
}

beforeEach(() => {
  loggedErrors.length = 0;
  callableHandlers.clear();
  lastCodeClientConfig = null;
  setIsAuthBypass(false);
  installGis();
});

describe('requestAndExchangeAuthCode', () => {
  it('returns { kind: "cancelled" } in auth-bypass mode (no Google round-trip)', async () => {
    setIsAuthBypass(true);
    const outcome = await requestAndExchangeAuthCode('client-id', 'a@b.c');
    expect(outcome.kind).toBe('cancelled');
    // Callable must NOT have been invoked.
    expect(callableHandlers.size).toBe(0);
  });

  it('returns { kind: "success" } when GIS provides a code and the exchange succeeds', async () => {
    setCallable('exchangeGoogleAuthCode', async (data: unknown) => {
      expect(data).toMatchObject({
        code: 'auth-code-1',
        redirectUri: 'postmessage',
      });
      return {
        data: {
          accessToken: 'access-1',
          expiresIn: 3600,
          hasRefreshToken: true,
        },
      };
    });

    const promise = requestAndExchangeAuthCode('client-id', 'a@b.c');
    // Drive the GIS callback.
    await new Promise((r) => setTimeout(r, 0));
    lastCodeClientConfig!.callback({ code: 'auth-code-1' });
    const outcome = await promise;
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.result.accessToken).toBe('access-1');
    }
  });

  it('returns { kind: "cancelled" } when GIS callback fires with no code and no error', async () => {
    const promise = requestAndExchangeAuthCode('client-id', undefined);
    await new Promise((r) => setTimeout(r, 0));
    lastCodeClientConfig!.callback({});
    const outcome = await promise;
    expect(outcome.kind).toBe('cancelled');
  });

  it('returns { kind: "error", reason } when GIS callback fires with response.error', async () => {
    const promise = requestAndExchangeAuthCode('client-id', undefined);
    await new Promise((r) => setTimeout(r, 0));
    lastCodeClientConfig!.callback({ error: 'access_denied' });
    const outcome = await promise;
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.reason).toBe('access_denied');
    }
  });

  it('returns { kind: "error" } when GIS error_callback fires', async () => {
    const promise = requestAndExchangeAuthCode('client-id', undefined);
    await new Promise((r) => setTimeout(r, 0));
    lastCodeClientConfig!.error_callback!({ type: 'popup_closed_by_user' });
    const outcome = await promise;
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.reason).toBe('popup_closed_by_user');
    }
  });

  it('returns { kind: "needs-consent", cause } when the backend rejects with details.reason', async () => {
    setCallable('exchangeGoogleAuthCode', async () => {
      throw new FunctionsError(
        'failed-precondition',
        'partial-consent: missing required scopes',
        { reason: 'needs-consent', cause: 'partial-consent' }
      );
    });

    const promise = requestAndExchangeAuthCode('client-id', undefined);
    await new Promise((r) => setTimeout(r, 0));
    lastCodeClientConfig!.callback({ code: 'c' });
    const outcome = await promise;
    expect(outcome.kind).toBe('needs-consent');
    if (outcome.kind === 'needs-consent') {
      expect(outcome.cause).toBe('partial-consent');
    }
  });

  it('returns { kind: "error" } when the GIS script never loads', async () => {
    uninstallGis();
    vi.useFakeTimers();
    try {
      const promise = requestAndExchangeAuthCode('client-id', undefined);
      // Fast-forward past the poll deadline so the timeout fires
      // without burning 5 seconds of real test time.
      await vi.advanceTimersByTimeAsync(6_000);
      const outcome = await promise;
      expect(outcome.kind).toBe('error');
      if (outcome.kind === 'error') {
        expect(outcome.reason).toMatch(/Google Identity Services/);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('refreshAccessTokenViaBackend', () => {
  it('returns { status: "error", message: "auth-bypass" } in auth-bypass mode', async () => {
    setIsAuthBypass(true);
    const outcome = await refreshAccessTokenViaBackend();
    expect(outcome).toEqual({ status: 'error', message: 'auth-bypass' });
  });

  it('returns { status: "ok" } with the access token on success', async () => {
    setCallable('refreshGoogleAccessToken', async () => ({
      data: { accessToken: 'fresh', expiresIn: 3600 },
    }));
    const outcome = await refreshAccessTokenViaBackend();
    expect(outcome).toEqual({
      status: 'ok',
      token: 'fresh',
      expiresIn: 3600,
    });
  });

  it('returns { status: "needs-consent" } from structured details.reason, not message-sniff', async () => {
    setCallable('refreshGoogleAccessToken', async () => {
      // Deliberately give the message NO "needs-consent" substring — the
      // server may rephrase messages without breaking the discriminant.
      throw new FunctionsError(
        'failed-precondition',
        'Token store unavailable, please retry.',
        { reason: 'needs-consent', cause: 'no-stored-token' }
      );
    });
    const outcome = await refreshAccessTokenViaBackend();
    expect(outcome.status).toBe('needs-consent');
    if (outcome.status === 'needs-consent') {
      expect(outcome.cause).toBe('no-stored-token');
    }
  });

  it('returns { status: "error", message: "no-token-in-response" } AND logs when backend omits accessToken', async () => {
    setCallable('refreshGoogleAccessToken', async () => ({
      data: { expiresIn: 3600 }, // no accessToken
    }));
    const outcome = await refreshAccessTokenViaBackend();
    expect(outcome).toEqual({
      status: 'error',
      message: 'no-token-in-response',
    });
    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0].scope).toBe(
      'googleOAuthRefresh.refreshAccessTokenViaBackend'
    );
  });

  it('returns { status: "error" } AND logs on arbitrary backend errors (no `needs-consent` details)', async () => {
    setCallable('refreshGoogleAccessToken', async () => {
      throw new FunctionsError('internal', 'Google refresh failed: 500', {
        reason: 'transient',
      });
    });
    const outcome = await refreshAccessTokenViaBackend();
    expect(outcome.status).toBe('error');
    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0].scope).toBe(
      'googleOAuthRefresh.refreshAccessTokenViaBackend'
    );
  });
});

describe('revokeBackendRefreshToken', () => {
  it('is a no-op in auth-bypass mode', async () => {
    setIsAuthBypass(true);
    await expect(revokeBackendRefreshToken()).resolves.toBeUndefined();
    // No callable invoked.
    expect(callableHandlers.size).toBe(0);
  });

  it('resolves when the backend succeeds', async () => {
    setCallable('revokeGoogleRefreshToken', async () => ({
      data: { revoked: true },
    }));
    await expect(revokeBackendRefreshToken()).resolves.toBeUndefined();
  });

  it('rejects when the backend fails — caller surfaces the toast', async () => {
    setCallable('revokeGoogleRefreshToken', async () => {
      throw new Error('Network failure');
    });
    await expect(revokeBackendRefreshToken()).rejects.toThrow(
      /Network failure/
    );
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import * as firebaseAuth from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/useAuth';
import type { AuthContextType } from '@/context/AuthContextValue';

/**
 * Tests for `AuthContext.ensureGoogleScope` — the Path B on-demand sensitive-
 * scope acquisition (docs/wide-distro-plan.md). Verifies:
 *   - silent-hit → returns the token AND persists it (state + localStorage)
 *   - silent-miss + interactive → escalates to the popup (prompt:'') and persists
 *   - silent-miss WITHOUT interactive → returns null, no popup
 *   - decline/error → null, no throw
 *   - the returned multi-scope token is written to the SAME keys every consumer
 *     reads, so existing Sheets/Calendar call sites pick it up transparently.
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

const GOOGLE_ACCESS_TOKEN_KEY = 'spart_google_access_token';
const GOOGLE_TOKEN_EXPIRY_KEY = 'spart_google_token_expiry';

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
 * Stub the GIS token client. The stub inspects the `prompt` passed to
 * `requestAccessToken({ prompt })` to decide its outcome:
 *   - silent (`'none'`): resolves per `silentMode`
 *   - interactive (`''`): resolves per `interactiveMode`
 * Captures every prompt seen for assertion (no-popup checks).
 */
function stubGis(opts: {
  silentMode: 'token' | 'denied';
  interactiveMode?: 'token' | 'denied';
  capturedPrompts?: string[];
  /** Captures the `scope` string GIS actually receives, for URL assertions. */
  capturedScopes?: string[];
  /**
   * Captures the (prompt, scope) PAIR for every GIS request. Tests that must
   * isolate a specific call's prompt/scope sequence from interleaved background
   * refreshes (the startup silent-refresh poll) filter this by `scope`, since
   * each GIS request's scope string uniquely identifies its origin (only
   * ensureGoogleScope carries the on-demand `spreadsheets`/`calendar` scope; a
   * background refresh carries drive.file-only).
   */
  calls?: { prompt: string; scope: string }[];
}): void {
  const initTokenClient = vi.fn(
    (config: {
      scope: string;
      callback: (r: { access_token?: string; expires_in?: string }) => void;
      error_callback: () => void;
    }) => ({
      requestAccessToken: (overrides?: { prompt?: string }) => {
        const prompt = overrides?.prompt ?? '';
        opts.capturedScopes?.push(config.scope);
        opts.capturedPrompts?.push(prompt);
        opts.calls?.push({ prompt, scope: config.scope });
        const mode = prompt === 'none' ? opts.silentMode : opts.interactiveMode;
        if (mode === 'token') {
          config.callback({ access_token: 'scoped-token', expires_in: '3600' });
        } else {
          config.error_callback();
        }
      },
    })
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
  localStorage.clear();
  vi.stubEnv(
    'VITE_GOOGLE_CLIENT_ID',
    'test-client-id.apps.googleusercontent.com'
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('AuthContext — ensureGoogleScope', () => {
  it('silent-hit: returns the token and persists it to localStorage + state', async () => {
    const capturedPrompts: string[] = [];
    const capturedScopes: string[] = [];
    stubGis({ silentMode: 'token', capturedPrompts, capturedScopes });
    await mountSignedIn('teacher@orono.k12.mn.us');

    let token: string | null = 'sentinel';
    await act(async () => {
      token = await getCtx().ensureGoogleScope('spreadsheets');
    });

    expect(token).toBe('scoped-token');
    // Persisted to the SAME keys every Sheets/Calendar consumer reads.
    expect(localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY)).toBe('scoped-token');
    expect(localStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY)).not.toBeNull();
    // And surfaced on the context state.
    await waitFor(() => {
      expect(getCtx().googleAccessToken).toBe('scoped-token');
    });
    // Only the silent prompt was used — NO popup.
    expect(capturedPrompts).toEqual(['none']);
    // CRITICAL (zero-prompt guarantee): the bare 'spreadsheets' key must be
    // normalized to the FULLY-QUALIFIED scope URL before reaching GIS, or the
    // silent re-mint would never match an existing grant.
    //
    // CRITICAL (no-strip guarantee): the request must be the UNION of the login
    // scope (drive.file) AND the on-demand scope (spreadsheets), NOT spreadsheets
    // alone. A spreadsheets-only token would NOT carry drive.file; persisting it
    // as the shared token would strip drive.file and break the Picker/Drive.
    expect(capturedScopes).toHaveLength(1);
    const requested = capturedScopes[0].split(' ');
    expect(requested).toContain('https://www.googleapis.com/auth/drive.file');
    expect(requested).toContain('https://www.googleapis.com/auth/spreadsheets');
  });

  it('normalizes the calendar.readonly key to its full scope URL for GIS', async () => {
    const capturedPrompts: string[] = [];
    const capturedScopes: string[] = [];
    stubGis({ silentMode: 'token', capturedPrompts, capturedScopes });
    await mountSignedIn('teacher@orono.k12.mn.us');

    await act(async () => {
      await getCtx().ensureGoogleScope('calendar.readonly');
    });

    // Union: drive.file + calendar.readonly (normalized from the bare key).
    expect(capturedScopes).toHaveLength(1);
    const requested = capturedScopes[0].split(' ');
    expect(requested).toContain('https://www.googleapis.com/auth/drive.file');
    expect(requested).toContain(
      'https://www.googleapis.com/auth/calendar.readonly'
    );
  });

  it('silent-miss WITHOUT interactive: returns null and never opens a popup', async () => {
    const capturedPrompts: string[] = [];
    stubGis({ silentMode: 'denied', capturedPrompts });
    await mountSignedIn('newuser@example.com');

    let token: string | null = 'sentinel';
    await act(async () => {
      token = await getCtx().ensureGoogleScope('spreadsheets');
    });

    expect(token).toBeNull();
    // Token must NOT be persisted on a silent miss.
    expect(localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY)).toBeNull();
    // Only the silent prompt was attempted; no interactive popup.
    expect(capturedPrompts).toEqual(['none']);
  });

  it('interactive grant: opens the popup (prompt:"") directly — no silent pre-flight — and persists', async () => {
    // `silentMode: 'denied'` proves the interactive path does NOT depend on a
    // prior silent('none') success: it goes straight to interactive('').
    const calls: { prompt: string; scope: string }[] = [];
    stubGis({
      silentMode: 'denied',
      interactiveMode: 'token',
      calls,
    });
    await mountSignedIn('newuser@example.com');

    let token: string | null = 'sentinel';
    await act(async () => {
      token = await getCtx().ensureGoogleScope('spreadsheets', {
        interactive: true,
      });
    });

    expect(token).toBe('scoped-token');
    expect(localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY)).toBe('scoped-token');
    // GESTURE PRESERVATION: the ensureGoogleScope-origin call goes straight to
    // the interactive popup (['']) — NO silent('none') first (isolated by the
    // unique on-demand scope so a background refresh's 'none' can't pollute it).
    const ensureScopePrompts = calls
      .filter((c) =>
        c.scope
          .split(' ')
          .some((s) => s === 'https://www.googleapis.com/auth/spreadsheets')
      )
      .map((c) => c.prompt);
    expect(ensureScopePrompts).toEqual(['']);
    // Specifically: the interactive call issued NO silent 'none' GIS request.
    expect(ensureScopePrompts).not.toContain('none');
  });

  it('decline: interactive popup dismissed → null, no throw, nothing persisted', async () => {
    // DETERMINISM: capture (prompt, scope) per GIS call and assert ONLY the
    // calls originating from ensureGoogleScope. AuthContext's startup
    // silent-refresh poll can fire its own `refreshGoogleToken(true)` → an extra
    // `prompt:'none'` that, on CI timing, interleaves into a flat prompt list.
    // The on-demand `spreadsheets` scope is UNIQUE to ensureGoogleScope here — a
    // background drive.file-only refresh never carries it — so
    // `ensureScopePrompts` isolates this call's prompt sequence regardless of
    // whether/when a background refresh fires.
    const calls: { prompt: string; scope: string }[] = [];
    stubGis({
      silentMode: 'denied',
      interactiveMode: 'denied',
      calls,
    });
    await mountSignedIn('newuser@example.com');

    let token: string | null = 'sentinel';
    await act(async () => {
      token = await getCtx().ensureGoogleScope('spreadsheets', {
        interactive: true,
      });
    });

    expect(token).toBeNull();
    expect(localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY)).toBeNull();
    // GESTURE PRESERVATION: an interactive ensureGoogleScope goes STRAIGHT to
    // the popup-capable interactive('') with NO silent('none') pre-flight — the
    // intervening `await` would lose the user gesture and get the popup blocked
    // on Safari/iOS. So the ensureGoogleScope-origin prompt sequence is [''].
    const ensureScopePrompts = calls
      .filter((c) =>
        // Exact scope membership in the space-separated scope list. Uses
        // `.some((s) => s === url)` rather than `.includes(url)`: CodeQL's
        // "Incomplete URL substring sanitization" rule flags `.includes` with a
        // URL literal even on arrays, and exact-equality is strictly more
        // correct anyway (no substring false-positives).
        c.scope
          .split(' ')
          .some((s) => s === 'https://www.googleapis.com/auth/spreadsheets')
      )
      .map((c) => c.prompt);
    expect(ensureScopePrompts).toEqual(['']);
  });

  it('no-strip across refresh: after a successful ensureGoogleScope, a later refreshGoogleToken re-mints the UNION (drive.file + spreadsheets)', async () => {
    // Both the silent ensureGoogleScope AND the subsequent silent refresh hit
    // the same stub, which mints a token whenever prompt:'none' is used.
    const capturedPrompts: string[] = [];
    const capturedScopes: string[] = [];
    stubGis({ silentMode: 'token', capturedPrompts, capturedScopes });
    await mountSignedIn('teacher@orono.k12.mn.us');

    // 1. Acquire the on-demand scope.
    await act(async () => {
      await getCtx().ensureGoogleScope('spreadsheets');
    });

    // 2. A proactive/startup refresh must MAINTAIN the on-demand scope rather
    //    than stripping it back to drive.file-only.
    let refreshed: string | null = null;
    await act(async () => {
      refreshed = await getCtx().refreshGoogleToken(true);
    });
    expect(refreshed).toBe('scoped-token');

    // The LAST GIS request (the refresh) must still include BOTH scopes.
    const lastScope = capturedScopes[capturedScopes.length - 1].split(' ');
    expect(lastScope).toContain('https://www.googleapis.com/auth/drive.file');
    expect(lastScope).toContain('https://www.googleapis.com/auth/spreadsheets');
    // Every GIS request stayed silent — no popup churn.
    expect(capturedPrompts.every((p) => p === 'none')).toBe(true);
  });

  it('no poison on silent-miss: a never-granted scope is NOT carried into subsequent drive.file-only refreshes', async () => {
    // The on-demand scope is never granted (silent denied, no interactive). With
    // ADD-ON-SUCCESS-ONLY the scope is never added to onDemandScopesRef on a
    // miss, so NO refresh path — neither the explicit one below nor any
    // background startup/proactive refresh — can ever request it.
    //
    // DETERMINISM: this is the load-bearing property. We assert the invariant
    // over EVERY captured refresh scope (the explicit `refreshGoogleToken(true)`
    // PLUS any background poll-driven refresh that happens to fire): none may
    // contain `spreadsheets`, all must contain `drive.file`. Because the source
    // fix makes a missed scope literally unreachable by any refresh, the
    // assertion holds no matter how the background refresh interleaves on CI —
    // there is no timing window in which a poisoned scope could appear.
    const calls: { prompt: string; scope: string }[] = [];
    stubGis({ silentMode: 'denied', calls });
    await mountSignedIn('newuser@example.com');

    let token: string | null = 'sentinel';
    await act(async () => {
      token = await getCtx().ensureGoogleScope('spreadsheets');
    });
    expect(token).toBeNull();

    const callsAfterEnsure = calls.length;

    // A later background refresh must request ONLY drive.file — the un-granted
    // spreadsheets scope must NOT be in the request, or the union silent re-mint
    // could fail and strip drive.file.
    await act(async () => {
      await getCtx().refreshGoogleToken(true);
    });

    // Every refresh-phase GIS request (explicit + any background) is clean.
    const refreshScopes = calls.slice(callsAfterEnsure).map((c) => c.scope);
    expect(refreshScopes.length).toBeGreaterThan(0);
    for (const s of refreshScopes) {
      const parts = s.split(' ');
      expect(parts).toContain('https://www.googleapis.com/auth/drive.file');
      expect(parts).not.toContain(
        'https://www.googleapis.com/auth/spreadsheets'
      );
    }
  });

  it('early return: an already-granted-this-session scope returns the live token with NO GIS call', async () => {
    // PRE-CONDITION: a first silent ensureGoogleScope grants `spreadsheets`,
    // adding it to onDemandScopesRef AND minting/persisting googleAccessToken.
    const calls: { prompt: string; scope: string }[] = [];
    stubGis({ silentMode: 'token', calls });
    await mountSignedIn('teacher@orono.k12.mn.us');

    await act(async () => {
      await getCtx().ensureGoogleScope('spreadsheets');
    });
    // The live token now carries the scope.
    await waitFor(() => {
      expect(getCtx().googleAccessToken).toBe('scoped-token');
    });

    // Snapshot the GIS calls carrying the on-demand scope so far.
    const ensureCallsBefore = calls.filter((c) =>
      c.scope
        .split(' ')
        .some((s) => s === 'https://www.googleapis.com/auth/spreadsheets')
    ).length;

    // SECOND call — scope already in the ref + a live token exists. Must EARLY
    // RETURN the live token without any new GIS request (no roundtrip, no popup
    // — even on an interactive call).
    let token: string | null = 'sentinel';
    await act(async () => {
      token = await getCtx().ensureGoogleScope('spreadsheets', {
        interactive: true,
      });
    });

    expect(token).toBe('scoped-token');
    // No NEW GIS request was issued for the on-demand scope on the early-return
    // path — the captured count is unchanged.
    const ensureCallsAfter = calls.filter((c) =>
      c.scope
        .split(' ')
        .some((s) => s === 'https://www.googleapis.com/auth/spreadsheets')
    ).length;
    expect(ensureCallsAfter).toBe(ensureCallsBefore);
  });

  it('returns null cleanly when GIS is unavailable (no popup, no throw)', async () => {
    // No `google` global stubbed — the GIS environment is absent.
    await mountSignedIn('teacher@orono.k12.mn.us');

    let token: string | null = 'sentinel';
    await act(async () => {
      token = await getCtx().ensureGoogleScope('calendar.readonly', {
        interactive: true,
      });
    });

    expect(token).toBeNull();
    expect(localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY)).toBeNull();
  });
});

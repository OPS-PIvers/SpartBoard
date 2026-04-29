/**
 * Component-level coverage for the SSO `studentRole` auto-join branch in
 * QuizStudentApp. The hook contract is already exercised in
 * `tests/hooks/useQuizSession.test.ts` (response doc keyed by `auth.uid`,
 * no `pin` field written, etc.); these tests pin down the *component* glue
 * that wires the URL → auth claims → hook call.
 *
 * Specifically guards:
 *  - SSO students auto-join with `(urlCode, undefined, undefined)` —
 *    confirming classPeriod is intentionally `undefined` for SSO joiners
 *    rather than being resolved via `lookupSession` (which is the design
 *    choice that distinguishes dev-paul's model from PR #1438's earlier
 *    "use picker for multi-period" model).
 *  - The period picker is never shown to an SSO student.
 *  - The StrictMode double-mount guard (`ssoAutoJoinStartedRef`) keeps the
 *    join call to exactly one fire even under double-invoked effects.
 *  - `lookupSession` / `joinQuizSession` failures surface in the UI rather
 *    than leaving the student sitting on the "Joining quiz…" loader.
 *  - Anonymous joiners see the PIN form (no auto-join).
 */
import React, { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// vi.mock is hoisted above imports, so any external references inside the
// factory must be declared via vi.hoisted (otherwise we hit the classic
// "Cannot access 'X' before initialization" trap).
const { mockAuth, mockJoinQuizSession, mockLookupSession } = vi.hoisted(() => {
  type MockUser = {
    uid: string;
    isAnonymous: boolean;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  };
  return {
    mockAuth: {
      onAuthStateChanged: vi.fn(),
      signInWithPopup: vi.fn(),
      signOut: vi.fn(),
      currentUser: null as MockUser | null,
    },
    mockJoinQuizSession: vi.fn(),
    mockLookupSession: vi.fn(),
  };
});

// Override setup.ts's global `@/config/firebase` mock so we can drive
// `auth.currentUser` per test (the global mock omits currentUser entirely).
vi.mock('@/config/firebase', () => ({
  isConfigured: false,
  isAuthBypass: false,
  app: {},
  db: {},
  auth: mockAuth,
  storage: {},
  functions: {},
  GOOGLE_OAUTH_SCOPES: [] as string[],
  googleProvider: {},
}));

// QuizStudentApp imports `signInAnonymously` directly from `firebase/auth`.
// In SSO scenarios `auth.currentUser` is already set so this never runs,
// but the module-level mock has to exist so Vite resolves the import.
vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
}));

// Stub the hook so we can observe the call args and control rejections.
// `normalizeAnswer` is also imported but only fires post-join, so a
// pass-through identity is fine.
vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionStudent: () => ({
    session: null,
    myResponse: null,
    loading: false,
    error: null,
    sessionIdRef: { current: null },
    lookupSession: mockLookupSession,
    joinQuizSession: mockJoinQuizSession,
    submitAnswer: vi.fn(),
    completeQuiz: vi.fn(),
    reportTabSwitch: vi.fn(),
    warningCount: 0,
  }),
  normalizeAnswer: (s: string) => s,
}));

// Imported AFTER the mocks above so the component picks up the stubs.
import { QuizStudentApp } from '@/components/quiz/QuizStudentApp';

/** Mint an `auth.currentUser` shape with the desired claims. */
function mintUser(opts: {
  uid: string;
  isAnonymous: boolean;
  studentRole: boolean;
}): {
  uid: string;
  isAnonymous: boolean;
  getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
} {
  return {
    uid: opts.uid,
    isAnonymous: opts.isAnonymous,
    getIdTokenResult: () =>
      Promise.resolve({ claims: { studentRole: opts.studentRole } }),
  };
}

/** Set the URL search string the component reads via `window.location.search`. */
function setSearch(search: string): void {
  window.history.replaceState({}, '', `/quiz${search}`);
}

describe('QuizStudentApp — SSO studentRole auto-join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJoinQuizSession.mockReset();
    mockLookupSession.mockReset();
    // Default to a successful join — individual tests override as needed.
    mockJoinQuizSession.mockResolvedValue('session-1');
    mockAuth.currentUser = null;
    setSearch('');
  });

  it('auto-joins on mount with (urlCode, undefined, undefined) and never shows the period picker', async () => {
    mockAuth.currentUser = mintUser({
      uid: 'sso-uid-1',
      isAnonymous: false,
      studentRole: true,
    });
    setSearch('?code=ABC123');

    render(<QuizStudentApp />);

    await waitFor(() => {
      expect(mockJoinQuizSession).toHaveBeenCalledWith(
        'ABC123',
        undefined,
        undefined
      );
    });

    // The period picker UI is keyed off the `setPeriodStep` call, which
    // dev-paul's auto-join effect never makes for SSO students.
    expect(screen.queryByText(/Select Your Class/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Which class period/i)).not.toBeInTheDocument();

    // And lookupSession is never consulted on the SSO path — that lookup
    // belonged to PR #1438's model and was deliberately removed.
    expect(mockLookupSession).not.toHaveBeenCalled();
  });

  it('does not auto-join when the user is anonymous (anon PIN flow renders the join form instead)', async () => {
    mockAuth.currentUser = mintUser({
      uid: 'anon-uid-1',
      isAnonymous: true,
      studentRole: false,
    });
    setSearch('?code=ABC123');

    render(<QuizStudentApp />);

    // Wait for the auth-init effect to finish (authReady=true) by waiting
    // for the PIN form to render. If we asserted `not.toHaveBeenCalled`
    // immediately after render(), we'd race the effect.
    expect(await screen.findByText(/Join Quiz/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Quiz Code/i)).toBeInTheDocument();

    expect(mockJoinQuizSession).not.toHaveBeenCalled();
  });

  it('does not auto-join when isStudentRole is false even if a code is in the URL', async () => {
    // Non-anonymous user but no studentRole claim — e.g., a teacher who
    // somehow lands on /quiz?code=…. The auth-init effect resolves
    // `isStudentRole=false`, so the auto-join effect's first guard trips.
    mockAuth.currentUser = mintUser({
      uid: 'teacher-uid-1',
      isAnonymous: false,
      studentRole: false,
    });
    setSearch('?code=ABC123');

    render(<QuizStudentApp />);

    // Auth-init eventually flips authReady=true; once it does, the join
    // form renders (same as the anon path, since isStudentRole is false).
    expect(await screen.findByText(/Join Quiz/i)).toBeInTheDocument();
    expect(mockJoinQuizSession).not.toHaveBeenCalled();
  });

  it('does not auto-join when the URL is missing the ?code param', async () => {
    mockAuth.currentUser = mintUser({
      uid: 'sso-uid-2',
      isAnonymous: false,
      studentRole: true,
    });
    setSearch(''); // no ?code

    render(<QuizStudentApp />);

    // Wait for authReady=true to land. With isStudentRole=true and
    // urlCode='', the second guard in the auto-join effect short-circuits,
    // and we fall through to the SSO loader since `joined` is still false.
    expect(await screen.findByText(/Joining quiz…/i)).toBeInTheDocument();

    expect(mockJoinQuizSession).not.toHaveBeenCalled();
  });

  it('fires exactly once under StrictMode (ssoAutoJoinStartedRef guard)', async () => {
    mockAuth.currentUser = mintUser({
      uid: 'sso-uid-3',
      isAnonymous: false,
      studentRole: true,
    });
    setSearch('?code=ABC123');

    render(
      <StrictMode>
        <QuizStudentApp />
      </StrictMode>
    );

    await waitFor(() => {
      expect(mockJoinQuizSession).toHaveBeenCalledTimes(1);
    });

    // Guard against late re-fires: pause briefly and re-check. If the ref
    // guard regresses, StrictMode's second effect invocation would
    // double-fire and this assertion would now read 2.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockJoinQuizSession).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error message in the UI when joinQuizSession rejects', async () => {
    mockAuth.currentUser = mintUser({
      uid: 'sso-uid-4',
      isAnonymous: false,
      studentRole: true,
    });
    setSearch('?code=ABC123');

    mockJoinQuizSession.mockRejectedValueOnce(
      new Error('Backend unavailable.')
    );

    render(<QuizStudentApp />);

    // The hook's own `error` state is null in this stub, so the render
    // branch falls back to `ssoAutoJoinError` — which is the field we just
    // verified the effect populates from the thrown Error's `.message`.
    expect(
      await screen.findByText(/Backend unavailable\./i)
    ).toBeInTheDocument();

    // And we should not be stuck on the "Joining quiz…" loader.
    expect(screen.queryByText(/Joining quiz…/i)).not.toBeInTheDocument();
  });

  it('uses a generic fallback message when the rejected value is not an Error', async () => {
    mockAuth.currentUser = mintUser({
      uid: 'sso-uid-5',
      isAnonymous: false,
      studentRole: true,
    });
    setSearch('?code=ABC123');

    // Reject with a non-Error to exercise the `instanceof Error ? … : fallback`
    // branch in the catch handler.
    mockJoinQuizSession.mockRejectedValueOnce('not-an-error-object');

    render(<QuizStudentApp />);

    expect(
      await screen.findByText(/We couldn't load your quiz/i)
    ).toBeInTheDocument();
  });
});

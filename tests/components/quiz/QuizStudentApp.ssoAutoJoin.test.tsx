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
import { signInAnonymously } from 'firebase/auth';

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
      // Real Firebase Auth resolves this once the initial state has been
      // determined from IndexedDB. QuizStudentApp awaits it before deciding
      // whether to sign in anonymously, so the tests must stub it.
      authStateReady: vi.fn().mockResolvedValue(undefined),
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
  onAuthStateChanged: vi.fn(() => () => undefined),
}));

// Stub the hook so we can observe the call args and control rejections.
// `normalizeAnswer` is also imported but only fires post-join, so a
// pass-through identity is fine. `SessionEndedError` and
// `AttemptLimitReachedError` are re-exported as real subclasses so the
// component's `err instanceof …` branches inside the SSO auto-join catch
// resolve correctly under the mock — without them the `instanceof` would
// target `undefined` and throw, which would break the "rejection surfaces
// in the UI" tests below.
vi.mock('@/hooks/useQuizSession', () => {
  class MockSessionEndedError extends Error {
    constructor() {
      super('This quiz session has already ended.');
      this.name = 'SessionEndedError';
    }
  }
  class MockAttemptLimitReachedError extends Error {
    constructor() {
      super('Attempt limit reached.');
      this.name = 'AttemptLimitReachedError';
    }
  }
  return {
    useQuizSessionStudent: () => ({
      session: null,
      myResponse: null,
      loading: false,
      error: null,
      sessionIdRef: { current: null },
      lookupSession: mockLookupSession,
      joinQuizSession: mockJoinQuizSession,
      subscribeForReview: vi.fn(),
      submitAnswer: vi.fn(),
      completeQuiz: vi.fn(),
      reportTabSwitch: vi.fn(),
      warningCount: 0,
    }),
    normalizeAnswer: (s: string) => s,
    SessionEndedError: MockSessionEndedError,
    AttemptLimitReachedError: MockAttemptLimitReachedError,
  };
});

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
    // Default authStateReady to a no-op resolve — tests that exercise the
    // hydration race override this to populate currentUser inside the
    // implementation.
    mockAuth.authStateReady.mockReset().mockResolvedValue(undefined);
    mockAuth.currentUser = null;
    setSearch('');
  });

  it('waits for authStateReady before signing in anonymously — preserves SSO user that hydrates from IndexedDB after mount', async () => {
    // Regression test for the bug where SSO students who previously visited
    // /join (leaving an anonymous-then-replaced user record in IndexedDB) get
    // bounced to the PIN form when navigating from /my-assignments → /quiz.
    //
    // The browser-native <a href> in AssignmentListItem causes a full page
    // load. Firebase Auth hydrates `auth.currentUser` asynchronously from
    // IndexedDB. If the component checks `auth.currentUser` synchronously
    // on mount it sees null and calls signInAnonymously(), silently
    // replacing the SSO user — and `isStudentRole` stays false, so the
    // auto-join effect never fires and the PIN form renders.
    //
    // Model the race: currentUser is null until authStateReady() resolves,
    // at which point we populate it with the SSO user (this is what real
    // Firebase Auth does when reading the IndexedDB record).
    mockAuth.currentUser = null;
    mockAuth.authStateReady.mockReset().mockImplementation(() => {
      mockAuth.currentUser = mintUser({
        uid: 'sso-uid-hydrated',
        isAnonymous: false,
        studentRole: true,
      });
      return Promise.resolve();
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

    // The bug we are guarding against: signInAnonymously must NOT be called
    // when an SSO user is about to hydrate from IndexedDB. If this assertion
    // ever fails, the race has regressed and SSO students will see the PIN
    // form again.
    expect(vi.mocked(signInAnonymously)).not.toHaveBeenCalled();
    expect(screen.queryByText(/Join Quiz/i)).not.toBeInTheDocument();
  });

  it('treats authStateReady rejection as a hard auth failure — does NOT silently demote to anonymous', async () => {
    // Regression test for the silent-failure mode the code-review caught:
    // if authStateReady() rejects (e.g. IndexedDB blocked in a private
    // window) and the component swallows the error, the subsequent
    // `if (!auth.currentUser) signInAnonymously()` block would silently
    // create a fresh anonymous user when an SSO user was about to
    // hydrate. That's the exact bug this PR is fixing — just on the
    // rejection path. QuizStudentApp's init effect must collapse hydration
    // and anonymous-sign-in into a single try/catch so a rejection routes
    // to the error screen instead of falling through.
    mockAuth.currentUser = null;
    mockAuth.authStateReady
      .mockReset()
      .mockRejectedValue(new Error('IndexedDB blocked'));

    setSearch('?code=ABC123');

    render(<QuizStudentApp />);

    // The component should render the auth-failure error UI, not silently
    // sign in anonymously and route to the PIN form.
    expect(await screen.findByText(/Unable to connect/i)).toBeInTheDocument();

    // Critically: no silent anonymous fallback.
    expect(vi.mocked(signInAnonymously)).not.toHaveBeenCalled();
    expect(mockJoinQuizSession).not.toHaveBeenCalled();
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

  it('preview-mode short-circuits to a static lobby — no signInAnonymously, no auto-join, banner visible', async () => {
    // A teacher arrives at /quiz?code=ABC&preview=1 via the Preview button.
    // Even with a non-anonymous (teacher) session already present and a code
    // in the URL, the auth-init effect and the SSO auto-join effect must
    // both no-op so the teacher's session isn't replaced or contaminated.
    mockAuth.currentUser = mintUser({
      uid: 'teacher-uid-preview',
      isAnonymous: false,
      studentRole: false,
    });
    setSearch('?code=ABC123&preview=1');

    render(<QuizStudentApp />);

    expect(await screen.findByText(/Teacher preview/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Join Quiz/i })
    ).toBeInTheDocument();

    expect(vi.mocked(signInAnonymously)).not.toHaveBeenCalled();
    expect(mockJoinQuizSession).not.toHaveBeenCalled();
    expect(mockLookupSession).not.toHaveBeenCalled();

    // `usePreviewMode` strips the flag on mount so a teacher copying the URL
    // from the address bar gets the real student URL.
    expect(window.location.search).toBe('?code=ABC123');
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

/* eslint-disable @typescript-eslint/require-await -- act() is typed
   to accept an async callback; passing synchronous bodies is idiomatic
   for dispatching listener calls that trigger React state updates. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import * as firebaseAuth from 'firebase/auth';
import { auth } from '@/config/firebase';
import { StudentAuthProvider } from '@/context/StudentAuthContext';
import { useStudentAuth } from '@/context/useStudentAuth';

/**
 * Tests for StudentAuthContext — claim-validation paths.
 *
 * The risky path is `extractStudentClaims`: a regression that accepts a
 * token missing `classIds`, missing `studentRole`, or with a non-string
 * `orgId` would silently bypass every Firestore-rules class-scoping test
 * by giving the student access to their own pseudonym writes with no
 * class scoping. These tests guard each rejection branch.
 *
 * The provider relies on `firebase/auth.onIdTokenChanged` for both initial
 * sign-in and subsequent token-refresh re-validation, so we mock it here
 * and capture the registered listener so individual tests can drive it.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// `useStudentIdleTimeout` would otherwise mount real `addEventListener`
// listeners and a 15-min timer; for these tests we only care about the
// auth lifecycle, so neutralize it.
vi.mock('@/hooks/useStudentIdleTimeout', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/useStudentIdleTimeout')
  >('@/hooks/useStudentIdleTimeout');
  return {
    ...actual,
    useStudentIdleTimeout: vi.fn(),
  };
});

vi.mock('firebase/auth', () => ({
  onIdTokenChanged: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type IdTokenListener = (user: unknown) => void;

interface MockClaims {
  studentRole?: unknown;
  orgId?: unknown;
  classIds?: unknown;
}

function buildMockUser(uid: string, claims: MockClaims) {
  return {
    uid,
    getIdTokenResult: vi.fn().mockResolvedValue({ claims }),
  };
}

function captureListener(): IdTokenListener {
  const onIdTokenChangedMock = vi.mocked(firebaseAuth.onIdTokenChanged);
  // The latest registration is what the provider just installed.
  const lastCall =
    onIdTokenChangedMock.mock.calls[onIdTokenChangedMock.mock.calls.length - 1];
  if (!lastCall) {
    throw new Error('onIdTokenChanged was never called by the provider');
  }
  // Signature is (auth, listener) — listener is the second positional arg.
  return lastCall[1] as IdTokenListener;
}

const Probe: React.FC = () => {
  const { status, pseudonymUid, orgId, classIds } = useStudentAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="uid">{pseudonymUid ?? ''}</span>
      <span data-testid="org">{orgId ?? ''}</span>
      <span data-testid="classes">{classIds.join(',')}</span>
    </div>
  );
};

function renderProvider() {
  return render(
    <StudentAuthProvider>
      <Probe />
    </StudentAuthProvider>
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: onIdTokenChanged returns an unsubscribe fn.
  vi.mocked(firebaseAuth.onIdTokenChanged).mockImplementation(() => vi.fn());
  // Default: no current user. Individual tests override.
  Object.defineProperty(auth, 'currentUser', {
    configurable: true,
    writable: true,
    value: null,
  });
  // Stub window.location.assign so the provider's "redirect on protected
  // route" branch can be exercised without jsdom navigation errors.
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, pathname: '/', assign: vi.fn() },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StudentAuthContext — claim validation', () => {
  it('rejects a user whose token is missing classIds and signs out', async () => {
    renderProvider();
    const listener = captureListener();

    const user = buildMockUser('pseudo-1', {
      studentRole: true,
      orgId: 'org-1',
      classIds: undefined,
    });
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: user,
    });

    await act(async () => {
      listener(user);
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    expect(firebaseAuth.signOut).toHaveBeenCalledTimes(1);
    expect(firebaseAuth.signOut).toHaveBeenCalledWith(auth);
    expect(screen.getByTestId('uid').textContent).toBe('');
    expect(screen.getByTestId('org').textContent).toBe('');
    expect(screen.getByTestId('classes').textContent).toBe('');
  });

  it('rejects a user whose token is missing studentRole and signs out', async () => {
    renderProvider();
    const listener = captureListener();

    const user = buildMockUser('pseudo-2', {
      studentRole: undefined,
      orgId: 'org-1',
      classIds: ['c-1'],
    });
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: user,
    });

    await act(async () => {
      listener(user);
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    expect(firebaseAuth.signOut).toHaveBeenCalledTimes(1);
    expect(firebaseAuth.signOut).toHaveBeenCalledWith(auth);
  });

  it('rejects an empty classIds array and signs out', async () => {
    // `extractStudentClaims` deliberately rejects `classIds: []` — a student
    // with zero classes has no Firestore paths they're allowed to read under
    // rules, so we'd strand them on MyAssignmentsPage with a silent empty
    // list and no recovery path. Better to fail sign-in and let the teacher
    // fix the enrollment. Pins this invariant.
    renderProvider();
    const listener = captureListener();

    const user = buildMockUser('pseudo-3', {
      studentRole: true,
      orgId: 'org-1',
      classIds: [],
    });
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: user,
    });

    await act(async () => {
      listener(user);
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    expect(firebaseAuth.signOut).toHaveBeenCalledTimes(1);
    expect(firebaseAuth.signOut).toHaveBeenCalledWith(auth);
  });

  it('rejects a user whose orgId claim is empty and signs out', async () => {
    renderProvider();
    const listener = captureListener();

    const user = buildMockUser('pseudo-4', {
      studentRole: true,
      orgId: '',
      classIds: ['c-1'],
    });
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: user,
    });

    await act(async () => {
      listener(user);
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    expect(firebaseAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('rejects a user whose classIds contains a non-string element and signs out', async () => {
    renderProvider();
    const listener = captureListener();

    const user = buildMockUser('pseudo-5', {
      studentRole: true,
      orgId: 'org-1',
      classIds: ['c-1', 42],
    });
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: user,
    });

    await act(async () => {
      listener(user);
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    expect(firebaseAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('exposes pseudonym + claims when the token is valid', async () => {
    renderProvider();
    const listener = captureListener();

    const user = buildMockUser('pseudo-good', {
      studentRole: true,
      orgId: 'org-1',
      classIds: ['c-1', 'c-2'],
    });
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: user,
    });

    await act(async () => {
      listener(user);
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
    expect(firebaseAuth.signOut).not.toHaveBeenCalled();
    expect(screen.getByTestId('uid').textContent).toBe('pseudo-good');
    expect(screen.getByTestId('org').textContent).toBe('org-1');
    expect(screen.getByTestId('classes').textContent).toBe('c-1,c-2');
  });

  it('signs out when a token refresh drops the classIds claim', async () => {
    renderProvider();
    const listener = captureListener();

    // First emission: valid claims → authenticated.
    const goodUser = buildMockUser('pseudo-refresh', {
      studentRole: true,
      orgId: 'org-1',
      classIds: ['c-1'],
    });
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: goodUser,
    });

    await act(async () => {
      listener(goodUser);
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
    expect(firebaseAuth.signOut).not.toHaveBeenCalled();

    // Second emission: same uid (token refresh, not a new sign-in), but
    // the classIds claim has dropped — provider must re-validate and
    // boot the session, not coast on the previous decision.
    const refreshedUser = buildMockUser('pseudo-refresh', {
      studentRole: true,
      orgId: 'org-1',
      classIds: undefined,
    });
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      writable: true,
      value: refreshedUser,
    });

    await act(async () => {
      listener(refreshedUser);
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    expect(firebaseAuth.signOut).toHaveBeenCalledTimes(1);
    expect(firebaseAuth.signOut).toHaveBeenCalledWith(auth);
  });

  it('transitions to unauthenticated when the user signs out (null user)', async () => {
    renderProvider();
    const listener = captureListener();

    await act(async () => {
      listener(null);
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    // Provider only calls firebaseSignOut when a *signed-in* user fails
    // claim validation. A null user already represents a signed-out
    // state, so no extra signOut is needed.
    expect(firebaseAuth.signOut).not.toHaveBeenCalled();
  });
});

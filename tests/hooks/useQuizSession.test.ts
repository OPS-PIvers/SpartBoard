import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import {
  normalizeAnswer,
  gradeAnswer,
  toPublicQuestion,
  useQuizSessionStudent,
  useQuizSessionTeacher,
} from '@/hooks/useQuizSession';
import { auth } from '@/config/firebase';
import type {
  QuizQuestion,
  QuizResponse,
  QuizSession,
  QuizPublicQuestion,
} from '@/types';

vi.mock('firebase/firestore');
vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon-uid' } }),
}));

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe('normalizeAnswer', () => {
  it('lowercases, trims, and collapses internal whitespace', () => {
    expect(normalizeAnswer('  Hello   World  ')).toBe('hello world');
  });

  it('treats tabs and newlines as whitespace', () => {
    expect(normalizeAnswer('a\tb\nc')).toBe('a b c');
  });

  it('returns empty string for all-whitespace input', () => {
    expect(normalizeAnswer('   \t\n ')).toBe('');
  });
});

describe('gradeAnswer', () => {
  const mcQuestion: QuizQuestion = {
    id: 'q1',
    timeLimit: 30,
    text: 'Capital of France?',
    type: 'MC',
    correctAnswer: 'Paris',
    incorrectAnswers: ['London', 'Berlin', 'Madrid'],
  };

  it('grades MC case-insensitively and ignores surrounding whitespace', () => {
    expect(gradeAnswer(mcQuestion, 'paris')).toBe(true);
    expect(gradeAnswer(mcQuestion, '  PARIS  ')).toBe(true);
    expect(gradeAnswer(mcQuestion, 'London')).toBe(false);
  });

  it('grades FIB with whitespace normalization', () => {
    const fib: QuizQuestion = {
      id: 'q2',
      timeLimit: 0,
      text: 'Two plus two equals',
      type: 'FIB',
      correctAnswer: 'four',
      incorrectAnswers: [],
    };
    expect(gradeAnswer(fib, '  Four  ')).toBe(true);
    expect(gradeAnswer(fib, 'five')).toBe(false);
  });

  it('grades Matching regardless of pair order', () => {
    const matching: QuizQuestion = {
      id: 'q3',
      timeLimit: 0,
      text: 'Match each',
      type: 'Matching',
      correctAnswer: 'dog:bark|cat:meow|cow:moo',
      incorrectAnswers: [],
    };
    expect(gradeAnswer(matching, 'cat:meow|dog:bark|cow:moo')).toBe(true);
    expect(gradeAnswer(matching, 'dog:bark|cat:meow|cow:moo')).toBe(true);
  });

  it('rejects Matching when a pair is wrong or missing', () => {
    const matching: QuizQuestion = {
      id: 'q3',
      timeLimit: 0,
      text: 'Match each',
      type: 'Matching',
      correctAnswer: 'dog:bark|cat:meow',
      incorrectAnswers: [],
    };
    expect(gradeAnswer(matching, 'dog:meow|cat:bark')).toBe(false);
    expect(gradeAnswer(matching, 'dog:bark')).toBe(false);
  });

  it('grades Ordering strictly by sequence', () => {
    const ordering: QuizQuestion = {
      id: 'q4',
      timeLimit: 0,
      text: 'Order these',
      type: 'Ordering',
      correctAnswer: 'first|second|third',
      incorrectAnswers: [],
    };
    expect(gradeAnswer(ordering, 'first|second|third')).toBe(true);
    expect(gradeAnswer(ordering, 'FIRST|Second|THIRD')).toBe(true);
    expect(gradeAnswer(ordering, 'first|third|second')).toBe(false);
  });
});

describe('toPublicQuestion', () => {
  it('strips correctAnswer and includes MC choices combining correct + filtered incorrect', () => {
    const q: QuizQuestion = {
      id: 'q1',
      timeLimit: 20,
      text: 'Pick one',
      type: 'MC',
      correctAnswer: 'alpha',
      incorrectAnswers: ['beta', '', 'gamma'], // empty string should be filtered
    };
    const pub = toPublicQuestion(q);
    expect(pub).not.toHaveProperty('correctAnswer');
    expect(pub).not.toHaveProperty('incorrectAnswers');
    expect(pub.id).toBe('q1');
    expect(pub.type).toBe('MC');
    expect(pub.text).toBe('Pick one');
    expect(pub.timeLimit).toBe(20);
    expect(pub.choices).toHaveLength(3);
    expect(pub.choices).toEqual(
      expect.arrayContaining(['alpha', 'beta', 'gamma'])
    );
  });

  it('splits Matching into left prompts and shuffled right values without leaking pairs', () => {
    const q: QuizQuestion = {
      id: 'q2',
      timeLimit: 0,
      text: 'Match',
      type: 'Matching',
      correctAnswer: 'dog:bark|cat:meow|cow:moo',
      incorrectAnswers: [],
    };
    const pub = toPublicQuestion(q);
    expect(pub.matchingLeft).toEqual(['dog', 'cat', 'cow']);
    expect(pub.matchingRight).toHaveLength(3);
    expect(pub.matchingRight).toEqual(
      expect.arrayContaining(['bark', 'meow', 'moo'])
    );
    expect(pub).not.toHaveProperty('correctAnswer');
  });

  it('splits Ordering into items without preserving order or correctAnswer', () => {
    const q: QuizQuestion = {
      id: 'q3',
      timeLimit: 0,
      text: 'Order',
      type: 'Ordering',
      correctAnswer: 'one|two|three|four',
      incorrectAnswers: [],
    };
    const pub = toPublicQuestion(q);
    expect(pub.orderingItems).toHaveLength(4);
    expect(pub.orderingItems).toEqual(
      expect.arrayContaining(['one', 'two', 'three', 'four'])
    );
    expect(pub).not.toHaveProperty('correctAnswer');
  });

  it('returns only base fields for FIB questions', () => {
    const q: QuizQuestion = {
      id: 'q4',
      timeLimit: 0,
      text: 'Fill in',
      type: 'FIB',
      correctAnswer: 'secret',
      incorrectAnswers: [],
    };
    const pub = toPublicQuestion(q);
    expect(pub.choices).toBeUndefined();
    expect(pub.matchingLeft).toBeUndefined();
    expect(pub.orderingItems).toBeUndefined();
    expect(pub).not.toHaveProperty('correctAnswer');
    expect(pub.id).toBe('q4');
    expect(pub.type).toBe('FIB');
  });
});

// ─── Student hook ─────────────────────────────────────────────────────────────

function buildSessionDoc(
  id: string,
  data: Partial<QuizSession> & { status: QuizSession['status'] }
) {
  return {
    id,
    data: () => data as QuizSession,
  };
}

describe('useQuizSessionStudent — lookupSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
    (
      firestore.collection as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({});
    (firestore.query as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {}
    );
    (firestore.where as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {}
    );
    (
      firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => vi.fn());
  });

  it('returns null when the code is empty after normalization', async () => {
    const { result } = renderHook(() => useQuizSessionStudent());
    await expect(result.current.lookupSession('  !!!  ')).resolves.toBeNull();
  });

  it('returns null when no matching session is found', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ empty: true, docs: [] });

    const { result } = renderHook(() => useQuizSessionStudent());
    await expect(result.current.lookupSession('ABC123')).resolves.toBeNull();
  });

  it('returns null when every matching session has already ended', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('old-1', { status: 'ended' })],
    });

    const { result } = renderHook(() => useQuizSessionStudent());
    await expect(result.current.lookupSession('ABC123')).resolves.toBeNull();
  });

  it('returns resolved periodNames for the most recently started joinable session', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [
        buildSessionDoc('older', {
          status: 'active',
          startedAt: 100,
          periodNames: ['Stale Period'],
        }),
        buildSessionDoc('newer', {
          status: 'waiting',
          startedAt: 999,
          periodNames: ['Period 1', 'Period 2'],
        }),
      ],
    });

    const { result } = renderHook(() => useQuizSessionStudent());
    const out = await result.current.lookupSession('abc-123');
    expect(out).toEqual({ periodNames: ['Period 1', 'Period 2'] });
  });
});

describe('useQuizSessionStudent — joinQuizSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default current user has no `isAnonymous` flag (falsy), matching the
    // pre-SSO test expectations: response doc is keyed by `auth.uid` and the
    // legacy-key probe is skipped. Tests that need the anonymous PIN-join
    // semantics (PIN-required guard, legacy-key probe path) override
    // `isAnonymous: true` locally; SSO branch tests assert against
    // `isAnonymous: false` explicitly.
    (auth as unknown as { currentUser: { uid: string } | null }).currentUser = {
      uid: 'student-uid-1',
    };
    (
      firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => vi.fn());
    (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
    (
      firestore.collection as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({});
    (firestore.query as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {}
    );
    (firestore.where as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {}
    );
  });

  it('throws "Invalid code" when the code normalizes to empty', async () => {
    const { result } = renderHook(() => useQuizSessionStudent());
    await expect(
      result.current.joinQuizSession('  !!  ', '1234')
    ).rejects.toThrow('Invalid code');
  });

  it('throws "PIN is required" when the PIN is only whitespace (anonymous joiner)', async () => {
    // Anonymous PIN joiners must always supply a PIN — that's their identity.
    // Non-anonymous (SSO) users skip this guard; covered separately below.
    (
      auth as unknown as {
        currentUser: { uid: string; isAnonymous: boolean } | null;
      }
    ).currentUser = { uid: 'anon-uid', isAnonymous: true };
    const { result } = renderHook(() => useQuizSessionStudent());
    await expect(
      result.current.joinQuizSession('ABC123', '   ')
    ).rejects.toThrow('PIN is required');
  });

  it('throws a not-found error when no session matches the code', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ empty: true, docs: [] });

    const { result } = renderHook(() => useQuizSessionStudent());
    await expect(
      result.current.joinQuizSession('ABC123', '1234')
    ).rejects.toThrow('No active quiz found with that code.');
  });

  it('throws when every matching session is ended', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('ended-1', { status: 'ended' })],
    });

    const { result } = renderHook(() => useQuizSessionStudent());
    await expect(
      result.current.joinQuizSession('ABC123', '1234')
    ).rejects.toThrow('This quiz session has already ended.');
  });

  it('prefers the most recently started joinable session and creates a response doc', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [
        buildSessionDoc('old', { status: 'active', startedAt: 100 }),
        buildSessionDoc('new', { status: 'waiting', startedAt: 999 }),
      ],
    });
    (
      firestore.getDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ exists: () => false });
    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useQuizSessionStudent());
    let sessionId = '';
    await act(async () => {
      sessionId = await result.current.joinQuizSession('abc-123', '1234');
    });
    expect(sessionId).toBe('new');
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const writtenResponse = setDocMock.mock.calls[0][1] as {
      pin: string;
      studentUid: string;
      status: string;
    };
    expect(writtenResponse.pin).toBe('1234');
    expect(writtenResponse.studentUid).toBe('student-uid-1');
    expect(writtenResponse.status).toBe('joined');
  });

  it('truncates an over-long PIN to 10 characters before writing', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('s1', { status: 'waiting' })],
    });
    (
      firestore.getDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ exists: () => false });
    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await result.current.joinQuizSession('ABC123', '123456789012345');
    });
    const writtenResponse = setDocMock.mock.calls[0][1] as { pin: string };
    expect(writtenResponse.pin).toBe('1234567890');
    expect(writtenResponse.pin.length).toBe(10);
  });

  it('normalizes the code by stripping non-alphanumerics and uppercasing before querying', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('s1', { status: 'waiting' })],
    });
    (
      firestore.getDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ exists: () => false });
    (
      firestore.setDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await result.current.joinQuizSession('  abc-123!!  ', '1234');
    });

    const whereCalls = (firestore.where as unknown as ReturnType<typeof vi.fn>)
      .mock.calls;
    const codeEqualsCall = whereCalls.find(
      (args) => args[0] === 'code' && args[1] === '=='
    );
    expect(codeEqualsCall).toBeDefined();
    expect(codeEqualsCall?.[2]).toBe('ABC123');
  });

  it('backfills classPeriod on an existing response when it changed', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('s1', { status: 'active' })],
    });
    (
      firestore.getDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ classPeriod: 'Period 1' }),
    });
    const updateDocMock = firestore.updateDoc as unknown as ReturnType<
      typeof vi.fn
    >;
    updateDocMock.mockResolvedValueOnce(undefined);
    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await result.current.joinQuizSession('ABC123', '1234', 'Period 2');
    });
    expect(setDocMock).not.toHaveBeenCalled();
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1]).toEqual({ classPeriod: 'Period 2' });
  });

  // Regression: PR #1441. Same shape as the legacy-key permission-denied
  // case below, but for the FIRST getDoc — the deterministic pin-based
  // probe. A doc may already exist at `pin-{period}-{pin}` written by a
  // different anon UID (real PIN+period collision across two students,
  // OR same student rejoining from a fresh browser session under a rotated
  // anon UID). The response read rule denies because
  // `request.auth.uid != resource.data.studentUid`; the fix swallows the
  // denial so the join falls through to the legacy probe / setDoc path.
  // Without this, the rejection propagated as an "Uncaught (in promise)
  // FirebaseError: Missing or insufficient permissions." in the browser.
  it('treats permission-denied on the deterministic-key getDoc as "no doc" for anon joiners', async () => {
    (
      auth as unknown as {
        currentUser: { uid: string; isAnonymous: boolean } | null;
      }
    ).currentUser = { uid: 'fresh-anon-uid', isAnonymous: true };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('s1', { status: 'active' })],
    });

    const getDocMock = firestore.getDoc as unknown as ReturnType<typeof vi.fn>;
    // 1st call: deterministic pin-based key — colliding doc owned by a
    // different (older) anon UID, so the rule rejects the read.
    const permissionDenied = Object.assign(
      new Error('Missing or insufficient permissions.'),
      { code: 'permission-denied' }
    );
    getDocMock.mockRejectedValueOnce(permissionDenied);
    // 2nd call: legacy authUid-keyed slot — no doc.
    getDocMock.mockResolvedValueOnce({ exists: () => false });

    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useQuizSessionStudent());
    let sessionId = '';
    await act(async () => {
      sessionId = await result.current.joinQuizSession('ABC123', '1234');
    });

    expect(sessionId).toBe('s1');
    // Join proceeded to write a new response doc at the deterministic key;
    // the permission-denied did NOT propagate.
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const writtenResponse = setDocMock.mock.calls[0][1] as {
      studentUid: string;
      status: string;
    };
    expect(writtenResponse.studentUid).toBe('fresh-anon-uid');
    expect(writtenResponse.status).toBe('joined');
  });

  // Symmetric blast-radius guard for the deterministic probe: only
  // permission-denied is swallowed. Any other Firestore failure must still
  // propagate so it isn't silently treated as "no doc, write a new one".
  it('still propagates non-permission-denied errors from the deterministic-key getDoc', async () => {
    (
      auth as unknown as {
        currentUser: { uid: string; isAnonymous: boolean } | null;
      }
    ).currentUser = { uid: 'fresh-anon-uid', isAnonymous: true };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('s1', { status: 'active' })],
    });

    const getDocMock = firestore.getDoc as unknown as ReturnType<typeof vi.fn>;
    const unavailable = Object.assign(new Error('Backend unavailable.'), {
      code: 'unavailable',
    });
    getDocMock.mockRejectedValueOnce(unavailable);

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await expect(
        result.current.joinQuizSession('ABC123', '1234')
      ).rejects.toThrow('Backend unavailable.');
    });
  });

  // Companion guard: for SSO/studentRole users (non-anonymous), a
  // permission-denied on the deterministic probe means a legitimate
  // class-gate denial — it must propagate (fail fast) instead of being
  // swallowed and falling through to a doomed setDoc.
  it('propagates permission-denied on the deterministic-key getDoc for non-anonymous (studentRole) joiners', async () => {
    (
      auth as unknown as {
        currentUser: { uid: string; isAnonymous: boolean } | null;
      }
    ).currentUser = { uid: 'sso-uid-1', isAnonymous: false };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('s1', { status: 'active' })],
    });

    const getDocMock = firestore.getDoc as unknown as ReturnType<typeof vi.fn>;
    const permissionDenied = Object.assign(
      new Error('Missing or insufficient permissions.'),
      { code: 'permission-denied' }
    );
    getDocMock.mockRejectedValueOnce(permissionDenied);

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await expect(result.current.joinQuizSession('ABC123')).rejects.toThrow(
        'Missing or insufficient permissions.'
      );
    });
  });

  // Regression: PR #1409 review. An anonymous student whose device has a
  // stale in-flight response doc keyed by a PRIOR anon uid will trigger a
  // legacy-key getDoc that Firestore rejects with permission-denied (the
  // updated response-read rule requires request.auth.uid ==
  // resource.data.studentUid, and the stale doc's studentUid is the old
  // uid). The fallback must swallow that rejection and treat it as
  // "no legacy doc" rather than bubbling out as a generic join error toast.
  it('treats permission-denied on the legacy-key getDoc as "no legacy doc" for anon joiners', async () => {
    (
      auth as unknown as {
        currentUser: { uid: string; isAnonymous: boolean } | null;
      }
    ).currentUser = {
      uid: 'new-anon-uid',
      isAnonymous: true,
    };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('s1', { status: 'active' })],
    });

    const getDocMock = firestore.getDoc as unknown as ReturnType<typeof vi.fn>;
    // 1st call: deterministic pin-based key — no doc yet.
    getDocMock.mockResolvedValueOnce({ exists: () => false });
    // 2nd call: legacy authUid-keyed slot — a doc exists from a previous
    // anon session on this device, but its studentUid field is the OLD uid,
    // so the security rule rejects the read.
    const permissionDenied = Object.assign(
      new Error('Missing or insufficient permissions.'),
      { code: 'permission-denied' }
    );
    getDocMock.mockRejectedValueOnce(permissionDenied);

    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useQuizSessionStudent());
    let sessionId = '';
    await act(async () => {
      sessionId = await result.current.joinQuizSession('ABC123', '1234');
    });

    expect(sessionId).toBe('s1');
    // New response doc was written at the deterministic key (legacy slot
    // was ignored), and the permission-denied error did NOT propagate.
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const writtenResponse = setDocMock.mock.calls[0][1] as {
      studentUid: string;
      status: string;
    };
    expect(writtenResponse.studentUid).toBe('new-anon-uid');
    expect(writtenResponse.status).toBe('joined');
  });

  // Guard the blast radius of the above catch: only permission-denied is
  // swallowed. Any other Firestore failure (unavailable, network, etc.)
  // must still propagate so it's not silently treated as "no legacy doc".
  it('still propagates non-permission-denied errors from the legacy-key getDoc', async () => {
    (
      auth as unknown as {
        currentUser: { uid: string; isAnonymous: boolean } | null;
      }
    ).currentUser = {
      uid: 'new-anon-uid',
      isAnonymous: true,
    };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('s1', { status: 'active' })],
    });

    const getDocMock = firestore.getDoc as unknown as ReturnType<typeof vi.fn>;
    getDocMock.mockResolvedValueOnce({ exists: () => false });
    const unavailable = Object.assign(new Error('Backend unavailable.'), {
      code: 'unavailable',
    });
    getDocMock.mockRejectedValueOnce(unavailable);

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await expect(
        result.current.joinQuizSession('ABC123', '1234')
      ).rejects.toThrow('Backend unavailable.');
    });
  });

  // ─── SSO `studentRole` branch ───────────────────────────────────────────────
  // Students arriving from /my-assignments are signed in via custom token
  // (non-anonymous Firebase user with `claims.studentRole === true`). The
  // hook keys the response doc by `auth.uid` and omits the `pin` field — the
  // teacher's grading view resolves their name via getPseudonymsForAssignmentV1.

  it('does not require a PIN for non-anonymous (studentRole) joiners', async () => {
    (
      auth as unknown as {
        currentUser: { uid: string; isAnonymous: boolean } | null;
      }
    ).currentUser = { uid: 'sso-uid-1', isAnonymous: false };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('s1', { status: 'waiting' })],
    });
    (
      firestore.getDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ exists: () => false });
    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useQuizSessionStudent());
    let sessionId = '';
    await act(async () => {
      // Note: no PIN argument.
      sessionId = await result.current.joinQuizSession('ABC123');
    });

    expect(sessionId).toBe('s1');
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const writtenResponse = setDocMock.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    // studentUid is the SSO auth uid, and `pin` is omitted entirely so the
    // teacher's name-resolution path falls through to byStudentUid.
    expect(writtenResponse.studentUid).toBe('sso-uid-1');
    expect(writtenResponse).not.toHaveProperty('pin');
    expect(writtenResponse.status).toBe('joined');
  });

  it('keys the studentRole response doc by auth.uid (not by pin-{period}-{pin})', async () => {
    (
      auth as unknown as {
        currentUser: { uid: string; isAnonymous: boolean } | null;
      }
    ).currentUser = { uid: 'sso-uid-2', isAnonymous: false };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [buildSessionDoc('s1', { status: 'waiting' })],
    });
    (
      firestore.getDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ exists: () => false });
    (
      firestore.setDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);

    const docMock = firestore.doc as unknown as ReturnType<typeof vi.fn>;

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await result.current.joinQuizSession('ABC123', undefined, 'Period 1');
    });

    // The hook calls `doc(db, QUIZ_SESSIONS_COLLECTION, sessionId,
    // RESPONSES_COLLECTION, responseKey)` once for the existence probe
    // (handled by getDoc) and once for the eventual write. Find a call
    // whose final segment is the response-doc key.
    const responseKeys: string[] = (docMock.mock.calls as unknown[][])
      .map((args) => args[args.length - 1])
      .filter((v): v is string => typeof v === 'string');
    expect(responseKeys).toContain('sso-uid-2');
    // No pin-derived key should ever be requested for an SSO joiner.
    expect(
      responseKeys.some((k) => typeof k === 'string' && k.startsWith('pin-'))
    ).toBe(false);
  });

  it('still rejects anonymous joiners with no PIN', async () => {
    (
      auth as unknown as {
        currentUser: { uid: string; isAnonymous: boolean } | null;
      }
    ).currentUser = { uid: 'anon-uid', isAnonymous: true };
    const { result } = renderHook(() => useQuizSessionStudent());
    await expect(result.current.joinQuizSession('ABC123')).rejects.toThrow(
      'PIN is required'
    );
  });

  it('writes classId on the SSO response when the token claim overlaps the session', async () => {
    // SSO student carries `classIds: ['classlink-A']` in their custom-token
    // claims; the session is targeted at `classIds: ['classlink-A']` —
    // exactly one match, so the join writes that id onto the response so
    // the teacher's results view can resolve it back to a roster name.
    (
      auth as unknown as {
        currentUser: {
          uid: string;
          isAnonymous: boolean;
          getIdTokenResult: () => Promise<{
            claims: { classIds?: unknown };
          }>;
        } | null;
      }
    ).currentUser = {
      uid: 'sso-uid-classid-1',
      isAnonymous: false,
      getIdTokenResult: () =>
        Promise.resolve({ claims: { classIds: ['classlink-A'] } }),
    };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [
        buildSessionDoc('s1', {
          status: 'waiting',
          classIds: ['classlink-A'],
        }),
      ],
    });
    (
      firestore.getDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ exists: () => false });
    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await result.current.joinQuizSession('ABC123');
    });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const writtenResponse = setDocMock.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(writtenResponse.classId).toBe('classlink-A');
    expect(writtenResponse).not.toHaveProperty('classPeriod');
  });

  it('omits classId when the SSO claim does not overlap the session', async () => {
    // The student's claim points at a class the session is NOT targeted at
    // — leave classId unset rather than guessing. The teacher will see the
    // student appear without a class period (same as today's behavior),
    // which is recoverable: a Re-export run after fixing targeting will
    // pick up the field once it's set.
    (
      auth as unknown as {
        currentUser: {
          uid: string;
          isAnonymous: boolean;
          getIdTokenResult: () => Promise<{
            claims: { classIds?: unknown };
          }>;
        } | null;
      }
    ).currentUser = {
      uid: 'sso-uid-classid-2',
      isAnonymous: false,
      getIdTokenResult: () =>
        Promise.resolve({ claims: { classIds: ['unrelated-class'] } }),
    };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [
        buildSessionDoc('s1', {
          status: 'waiting',
          classIds: ['classlink-A'],
        }),
      ],
    });
    (
      firestore.getDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ exists: () => false });
    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await result.current.joinQuizSession('ABC123');
    });

    const writtenResponse = setDocMock.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(writtenResponse).not.toHaveProperty('classId');
  });

  it('omits classId when the SSO claim intersection is ambiguous', async () => {
    // Two-way overlap: targeting/claim mismatch the teacher should fix.
    // We refuse to guess rather than writing a wrong period to the sheet.
    (
      auth as unknown as {
        currentUser: {
          uid: string;
          isAnonymous: boolean;
          getIdTokenResult: () => Promise<{
            claims: { classIds?: unknown };
          }>;
        } | null;
      }
    ).currentUser = {
      uid: 'sso-uid-classid-3',
      isAnonymous: false,
      getIdTokenResult: () =>
        Promise.resolve({
          claims: { classIds: ['classlink-A', 'classlink-B'] },
        }),
    };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [
        buildSessionDoc('s1', {
          status: 'waiting',
          classIds: ['classlink-A', 'classlink-B'],
        }),
      ],
    });
    (
      firestore.getDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ exists: () => false });
    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await result.current.joinQuizSession('ABC123');
    });

    const writtenResponse = setDocMock.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(writtenResponse).not.toHaveProperty('classId');
  });

  it('does not resolve classId for anonymous PIN joiners', async () => {
    // PIN joiners pick a period through the picker — the student-side
    // shortcut `if (!currentUser.isAnonymous && !classPeriod)` short-circuits
    // for them, so classId is never written. Anonymous joiners take the
    // double-probe path through findExistingResponseDoc (deterministic
    // pin-key, then legacy auth-uid key for rejoin) so we mock two
    // misses before setDoc.
    (
      auth as unknown as {
        currentUser: { uid: string; isAnonymous: boolean } | null;
      }
    ).currentUser = { uid: 'anon-uid-pin', isAnonymous: true };

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [
        buildSessionDoc('s1', {
          status: 'waiting',
          classIds: ['classlink-A'],
        }),
      ],
    });
    (firestore.getDoc as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => false });
    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useQuizSessionStudent());
    await act(async () => {
      await result.current.joinQuizSession('ABC123', '1234', 'Period 1');
    });

    const writtenResponse = setDocMock.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(writtenResponse.classPeriod).toBe('Period 1');
    expect(writtenResponse).not.toHaveProperty('classId');
  });
});

// ─── Teacher hook ─────────────────────────────────────────────────────────────

const DELETE_FIELD_SENTINEL = Symbol('__deleteField__');

type SnapshotCallback = (snap: unknown) => void;

interface TeacherMockEnv {
  /** Latest captured session-doc snapshot callback. */
  sessionCallback: SnapshotCallback | null;
  /** Latest captured responses-collection snapshot callback. */
  responsesCallback: SnapshotCallback | null;
  /** All `doc(...)` calls in argument-array form (post-db). */
  docCalls: unknown[][];
  /** All `collection(...)` calls in argument-array form (post-db). */
  collectionCalls: unknown[][];
  /** Mock writeBatch instance the hook will use during finalize. */
  batch: { update: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> };
}

/**
 * Wire up the firebase/firestore mocks for the teacher hook.
 *
 * The teacher hook subscribes via two `onSnapshot` calls — first to the
 * session doc, then (gated on `hasSession`) to the responses subcollection.
 * We capture each callback so tests can drive state transitions
 * deterministically (no fake timers needed).
 */
function setupTeacherMocks(): TeacherMockEnv {
  const env: TeacherMockEnv = {
    sessionCallback: null,
    responsesCallback: null,
    docCalls: [],
    collectionCalls: [],
    batch: {
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    },
  };

  (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (...args: unknown[]) => {
      // Drop the db ref (first arg) — tests assert on the path segments.
      env.docCalls.push(args.slice(1));
      return { __type: 'doc', path: args.slice(1) };
    }
  );
  (
    firestore.collection as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((...args: unknown[]) => {
    env.collectionCalls.push(args.slice(1));
    return { __type: 'collection', path: args.slice(1) };
  });

  let snapshotCallIndex = 0;
  (
    firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((_target: unknown, onNext: SnapshotCallback) => {
    if (snapshotCallIndex === 0) env.sessionCallback = onNext;
    else env.responsesCallback = onNext;
    snapshotCallIndex += 1;
    return vi.fn();
  });

  (
    firestore.updateDoc as unknown as ReturnType<typeof vi.fn>
  ).mockResolvedValue(undefined);
  (
    firestore.deleteDoc as unknown as ReturnType<typeof vi.fn>
  ).mockResolvedValue(undefined);
  (
    firestore.deleteField as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue(DELETE_FIELD_SENTINEL);
  (firestore.writeBatch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    env.batch
  );

  return env;
}

interface ResponseDocFixture {
  id: string;
  data: QuizResponse;
}

function buildResponseDocs(fixtures: ResponseDocFixture[]) {
  return fixtures.map((f) => ({
    id: f.id,
    ref: {
      __type: 'doc',
      path: ['quiz_sessions', 'sess-1', 'responses', f.id],
    },
    data: () => f.data,
  }));
}

function buildSession(
  partial: Partial<QuizSession> & { status: QuizSession['status'] }
): QuizSession {
  // Cast through unknown — only the fields the hook reads are required for
  // these unit tests, and inventing a fully-typed session would make the
  // fixtures noisy without exercising additional code paths.
  return {
    code: 'ABC123',
    publicQuestions: [] as QuizPublicQuestion[],
    currentQuestionIndex: 0,
    totalQuestions: 0,
    sessionMode: 'auto',
    showPodiumBetweenQuestions: false,
    revealedAnswers: {},
    autoProgressAt: null,
    startedAt: null,
    endedAt: null,
    questionPhase: 'answering',
    ...partial,
  } as unknown as QuizSession;
}

describe('useQuizSessionTeacher — removeStudent / revealAnswer / hideAnswer', () => {
  let env: TeacherMockEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    env = setupTeacherMocks();
  });

  it('deletes the response doc keyed by responseKey (not studentUid)', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));

    await act(async () => {
      // PIN-derived key — distinct from any studentUid value in the doc.
      await result.current.removeStudent('pin-period_1-9999');
    });

    expect(firestore.deleteDoc).toHaveBeenCalledTimes(1);
    // Confirm the path segments target the responses subcollection at the
    // PIN-derived key, which is what the teacher monitor passes in.
    const lastDocCall = env.docCalls.at(-1);
    expect(lastDocCall).toEqual([
      'quiz_sessions',
      'sess-1',
      'responses',
      'pin-period_1-9999',
    ]);
  });

  it('removeStudent is a no-op when sessionId is null', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher(null));

    await act(async () => {
      await result.current.removeStudent('pin-period_1-9999');
    });

    expect(firestore.deleteDoc).not.toHaveBeenCalled();
  });

  it('revealAnswer writes a dotted-path map entry on the session doc', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));

    await act(async () => {
      await result.current.revealAnswer('q-7', 'Paris');
    });

    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    const updatePayload = (
      firestore.updateDoc as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0][1];
    expect(updatePayload).toEqual({ 'revealedAnswers.q-7': 'Paris' });
  });

  it('hideAnswer writes deleteField() at the dotted path', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));

    await act(async () => {
      await result.current.hideAnswer('q-7');
    });

    expect(firestore.deleteField).toHaveBeenCalledTimes(1);
    const updatePayload = (
      firestore.updateDoc as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0][1];
    expect(updatePayload).toEqual({
      'revealedAnswers.q-7': DELETE_FIELD_SENTINEL,
    });
  });
});

describe('useQuizSessionTeacher — endQuizSession', () => {
  let env: TeacherMockEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    env = setupTeacherMocks();
  });

  it('flips the session to ended and finalizes only joined / in-progress responses', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      docs: buildResponseDocs([
        {
          id: 'pin-default-aaa',
          data: {
            studentUid: 'a',
            pin: 'aaa',
            joinedAt: 1,
            status: 'in-progress',
            answers: [],
            score: null,
            submittedAt: null,
          } as QuizResponse,
        },
        {
          id: 'pin-default-bbb',
          data: {
            studentUid: 'b',
            pin: 'bbb',
            joinedAt: 2,
            status: 'joined',
            answers: [],
            score: null,
            submittedAt: null,
          } as QuizResponse,
        },
        {
          id: 'pin-default-ccc',
          data: {
            studentUid: 'c',
            pin: 'ccc',
            joinedAt: 3,
            status: 'completed',
            answers: [],
            score: null,
            submittedAt: 999,
          } as QuizResponse,
        },
      ]),
    });

    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));

    const before = Date.now();
    await act(async () => {
      await result.current.endQuizSession();
    });
    const after = Date.now();

    const updateMock = firestore.updateDoc as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(updateMock).toHaveBeenCalledTimes(1);
    const sessionPatch = updateMock.mock.calls[0][1] as {
      status: string;
      endedAt: number;
      autoProgressAt: null;
    };
    expect(sessionPatch.status).toBe('ended');
    expect(sessionPatch.autoProgressAt).toBeNull();
    expect(sessionPatch.endedAt).toBeGreaterThanOrEqual(before);
    expect(sessionPatch.endedAt).toBeLessThanOrEqual(after);

    // finalizeAllResponses must touch only the two non-completed docs.
    expect(env.batch.update).toHaveBeenCalledTimes(2);
    const updateCalls = env.batch.update.mock.calls as Array<
      [{ path: string[] }, { status: string; submittedAt: unknown }]
    >;
    const updatedRefs = updateCalls.map((c) => c[0].path[3]);
    expect(updatedRefs).toEqual(
      expect.arrayContaining(['pin-default-aaa', 'pin-default-bbb'])
    );
    expect(updatedRefs).not.toContain('pin-default-ccc');
    for (const call of updateCalls) {
      expect(call[1]).toMatchObject({ status: 'completed' });
      expect(typeof call[1].submittedAt).toBe('number');
    }
    expect(env.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('skips the batch commit when no responses need finalizing', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      docs: buildResponseDocs([
        {
          id: 'pin-default-ccc',
          data: {
            studentUid: 'c',
            pin: 'ccc',
            joinedAt: 3,
            status: 'completed',
            answers: [],
            score: null,
            submittedAt: 999,
          } as QuizResponse,
        },
      ]),
    });

    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));

    await act(async () => {
      await result.current.endQuizSession();
    });

    expect(env.batch.update).not.toHaveBeenCalled();
    expect(env.batch.commit).not.toHaveBeenCalled();
  });

  it('endQuizSession is a no-op when sessionId is null', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher(null));

    await act(async () => {
      await result.current.endQuizSession();
    });

    expect(firestore.updateDoc).not.toHaveBeenCalled();
    expect(firestore.getDocs).not.toHaveBeenCalled();
  });
});

describe('useQuizSessionTeacher — advanceQuestion', () => {
  let env: TeacherMockEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    env = setupTeacherMocks();
  });

  /** Drive the session listener to populate hook state with `session`. */
  function emitSession(session: QuizSession) {
    if (!env.sessionCallback) {
      throw new Error('Session listener was never subscribed');
    }
    act(() => {
      env.sessionCallback?.({
        exists: () => true,
        data: () => session,
      });
    });
  }

  it('returns early without writing when no session has loaded yet', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));

    await act(async () => {
      await result.current.advanceQuestion();
    });

    expect(firestore.updateDoc).not.toHaveBeenCalled();
  });

  it('enters the review phase when podium-between is enabled and not yet reviewing', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));
    emitSession(
      buildSession({
        status: 'active',
        currentQuestionIndex: 0,
        totalQuestions: 5,
        sessionMode: 'auto',
        showPodiumBetweenQuestions: true,
        questionPhase: 'answering',
      })
    );

    await act(async () => {
      await result.current.advanceQuestion();
    });

    const updateMock = firestore.updateDoc as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][1]).toEqual({
      questionPhase: 'reviewing',
      autoProgressAt: null,
    });
  });

  it('skips the review-phase gate for student-paced sessions', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));
    emitSession(
      buildSession({
        status: 'active',
        currentQuestionIndex: 0,
        totalQuestions: 5,
        sessionMode: 'student',
        showPodiumBetweenQuestions: true,
        questionPhase: 'answering',
        startedAt: 1234,
      })
    );

    await act(async () => {
      await result.current.advanceQuestion();
    });

    const updateMock = firestore.updateDoc as unknown as ReturnType<
      typeof vi.fn
    >;
    // Should advance directly, not enter review.
    expect(updateMock).toHaveBeenCalledTimes(1);
    const patch = updateMock.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.currentQuestionIndex).toBe(1);
    expect(patch.questionPhase).toBe('answering');
    expect(patch).not.toHaveProperty('startedAt');
  });

  it('advances to the next question and sets startedAt on the first advance', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));
    emitSession(
      buildSession({
        status: 'active',
        currentQuestionIndex: 0,
        totalQuestions: 3,
        sessionMode: 'auto',
        showPodiumBetweenQuestions: false,
        startedAt: null,
      })
    );

    const before = Date.now();
    await act(async () => {
      await result.current.advanceQuestion();
    });
    const after = Date.now();

    const updateMock = firestore.updateDoc as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(updateMock).toHaveBeenCalledTimes(1);
    const patch = updateMock.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.status).toBe('active');
    expect(patch.currentQuestionIndex).toBe(1);
    expect(patch.questionPhase).toBe('answering');
    expect(patch.autoProgressAt).toBeNull();
    expect(typeof patch.startedAt).toBe('number');
    expect(patch.startedAt as number).toBeGreaterThanOrEqual(before);
    expect(patch.startedAt as number).toBeLessThanOrEqual(after);
  });

  it('does not overwrite startedAt on subsequent advances', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));
    emitSession(
      buildSession({
        status: 'active',
        currentQuestionIndex: 1,
        totalQuestions: 3,
        sessionMode: 'auto',
        showPodiumBetweenQuestions: false,
        startedAt: 5555,
      })
    );

    await act(async () => {
      await result.current.advanceQuestion();
    });

    const patch = (firestore.updateDoc as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('startedAt');
    expect(patch.currentQuestionIndex).toBe(2);
  });

  it('passes through the review gate when already in the reviewing phase', async () => {
    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));
    emitSession(
      buildSession({
        status: 'active',
        currentQuestionIndex: 0,
        totalQuestions: 3,
        sessionMode: 'auto',
        showPodiumBetweenQuestions: true,
        questionPhase: 'reviewing',
        startedAt: 1000,
      })
    );

    await act(async () => {
      await result.current.advanceQuestion();
    });

    const patch = (firestore.updateDoc as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][1] as Record<string, unknown>;
    // Already reviewing → must advance to next question, not re-enter review.
    expect(patch.currentQuestionIndex).toBe(1);
    expect(patch.questionPhase).toBe('answering');
  });

  it('flips the session to ended and finalizes responses when advancing past the last question', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      docs: buildResponseDocs([
        {
          id: 'pin-default-aaa',
          data: {
            studentUid: 'a',
            pin: 'aaa',
            joinedAt: 1,
            status: 'in-progress',
            answers: [],
            score: null,
            submittedAt: null,
          } as QuizResponse,
        },
      ]),
    });

    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));
    emitSession(
      buildSession({
        status: 'active',
        currentQuestionIndex: 2, // last index — advancing rolls past the end
        totalQuestions: 3,
        sessionMode: 'auto',
        showPodiumBetweenQuestions: false,
        startedAt: 1000,
      })
    );

    await act(async () => {
      await result.current.advanceQuestion();
    });

    const updateMock = firestore.updateDoc as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(updateMock).toHaveBeenCalledTimes(1);
    const patch = updateMock.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.status).toBe('ended');
    expect(patch.currentQuestionIndex).toBe(3);
    expect(patch.autoProgressAt).toBeNull();
    expect(patch.questionPhase).toBe(DELETE_FIELD_SENTINEL);
    expect(typeof patch.endedAt).toBe('number');

    // finalizeAllResponses ran inside the same advance call.
    expect(env.batch.update).toHaveBeenCalledTimes(1);
    expect(env.batch.commit).toHaveBeenCalledTimes(1);
  });
});

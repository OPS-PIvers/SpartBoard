import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import {
  normalizeAnswer,
  gradeAnswer,
  toPublicQuestion,
  useQuizSessionStudent,
} from '@/hooks/useQuizSession';
import { auth } from '@/config/firebase';
import type { QuizQuestion, QuizSession } from '@/types';

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

  it('throws "PIN is required" when the PIN is only whitespace', async () => {
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
});

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useVideoActivitySessionTeacher } from '@/hooks/useVideoActivitySession';
import type {
  VideoActivityData,
  VideoActivitySession,
  VideoActivitySessionOptions,
} from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: vi.fn(),
  writeBatch: vi.fn(),
  arrayUnion: vi.fn((v: unknown) => ({ __arrayUnion: v })),
  increment: vi.fn((n: number) => ({ __increment: n })),
  runTransaction: vi.fn(),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    __where: { field, op, value },
  })),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
}));

vi.mock('firebase/auth', () => ({
  signInWithCustomToken: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  auth: { currentUser: null },
  functions: { __mock: 'functions' },
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockGetDoc = getDoc as Mock;
const mockSetDoc = setDoc as Mock;
const mockUpdateDoc = updateDoc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;
const mockOrderBy = orderBy as Mock;
const mockWhere = where as Mock;

const ACTIVITY_ID = 'act-1';
const TEACHER_UID = 'teacher-1';

const baseActivity = (
  overrides: Partial<VideoActivityData> = {}
): VideoActivityData => ({
  id: ACTIVITY_ID,
  title: 'Mitosis Clip',
  youtubeUrl: 'https://youtu.be/abc',
  questions: [],
  createdAt: 100,
  updatedAt: 100,
  ...overrides,
});

// The teacher hook reads `snap.docs.map(...)`, so the fake snapshot exposes a
// `docs` array whose entries carry an `id` and a `data()` getter.
const fakeSnap = (
  docs: Array<{ id: string; data: Record<string, unknown> }>
) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
});

// A single-document snapshot (for the session-doc listener / getDoc paths).
const fakeDocSnap = (id: string, data: Record<string, unknown> | null) => ({
  id,
  exists: () => data !== null,
  data: () => data,
});

let batchUpdate: Mock;
let batchCommit: Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockReturnValue(() => undefined);
  batchUpdate = vi.fn();
  batchCommit = vi.fn().mockResolvedValue(undefined);
  mockWriteBatch.mockReturnValue({ update: batchUpdate, commit: batchCommit });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useVideoActivitySessionTeacher — createSession', () => {
  it('writes the full session payload to the sessionId doc path and returns the id', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '11111111-1111-4111-8111-111111111111'
    );
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const { result } = renderHook(() => useVideoActivitySessionTeacher());
    const activity = baseActivity({ questions: [] });

    let returned = '';
    await act(async () => {
      returned = await result.current.createSession(
        activity,
        TEACHER_UID,
        ['1234'],
        undefined,
        'My Assignment'
      );
    });

    expect(returned).toBe('11111111-1111-4111-8111-111111111111');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockSetDoc.mock.calls[0] ?? [];
    expect(path).toBe(
      'video_activity_sessions/11111111-1111-4111-8111-111111111111'
    );
    expect(payload).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      activityId: ACTIVITY_ID,
      activityTitle: 'Mitosis Clip',
      assignmentName: 'My Assignment',
      teacherUid: TEACHER_UID,
      youtubeUrl: 'https://youtu.be/abc',
      questions: [],
      settings: {
        autoPlay: false,
        requireCorrectAnswer: true,
        allowSkipping: false,
      },
      status: 'active',
      allowedPins: ['1234'],
      createdAt: 1700000000000,
      mode: 'submissions',
    });
  });

  it('trims the assignment name', async () => {
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await act(async () => {
      await result.current.createSession(
        baseActivity(),
        TEACHER_UID,
        [],
        undefined,
        '  Padded Name  '
      );
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as VideoActivitySession;
    expect(payload.assignmentName).toBe('Padded Name');
  });

  it('falls back to a title-prefixed name when the assignment name is blank', async () => {
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await act(async () => {
      await result.current.createSession(
        baseActivity({ title: 'Photosynthesis' }),
        TEACHER_UID,
        [],
        undefined,
        '   '
      );
    });

    // The fallback uses `new Date().toLocaleString()` (live clock), so only the
    // title-prefixed shape is asserted rather than an exact timestamp.
    const payload = mockSetDoc.mock.calls[0]?.[1] as VideoActivitySession;
    expect(payload.assignmentName).toMatch(/^Photosynthesis /);
  });

  it('merges provided settings over the defaults', async () => {
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await act(async () => {
      await result.current.createSession(baseActivity(), TEACHER_UID, [], {
        autoPlay: true,
        allowSkipping: true,
      });
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as VideoActivitySession;
    expect(payload.settings).toEqual({
      autoPlay: true,
      requireCorrectAnswer: true, // default preserved
      allowSkipping: true,
    });
  });

  it('includes classIds and mirrors classId to classIds[0] when classIds are present', async () => {
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await act(async () => {
      await result.current.createSession(
        baseActivity(),
        TEACHER_UID,
        [],
        undefined,
        'A',
        ['c1', 'c2']
      );
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as VideoActivitySession;
    expect(payload.classIds).toEqual(['c1', 'c2']);
    expect(payload.classId).toBe('c1');
  });

  it('includes periodNames, rosterIds, classPeriodByClassId, and sessionOptions when present', async () => {
    const { result } = renderHook(() => useVideoActivitySessionTeacher());
    const sessionOptions = {
      attemptLimit: 2,
    } as unknown as VideoActivitySessionOptions;

    await act(async () => {
      await result.current.createSession(
        baseActivity(),
        TEACHER_UID,
        [],
        undefined,
        'A',
        ['c1'],
        ['Period 1'],
        ['r1'],
        'submissions',
        { c1: 'Period 1' },
        sessionOptions
      );
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as VideoActivitySession;
    expect(payload.periodNames).toEqual(['Period 1']);
    expect(payload.rosterIds).toEqual(['r1']);
    expect(payload.classPeriodByClassId).toEqual({ c1: 'Period 1' });
    expect(payload.sessionOptions).toEqual(sessionOptions);
  });

  it('omits all optional targeting fields when none are provided', async () => {
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await act(async () => {
      await result.current.createSession(
        baseActivity(),
        TEACHER_UID,
        [],
        undefined,
        'A',
        [],
        [],
        []
      );
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect('classIds' in payload).toBe(false);
    expect('classId' in payload).toBe(false);
    expect('periodNames' in payload).toBe(false);
    expect('rosterIds' in payload).toBe(false);
    expect('classPeriodByClassId' in payload).toBe(false);
    expect('sessionOptions' in payload).toBe(false);
  });

  it('passes the assignment mode through to the session doc', async () => {
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await act(async () => {
      await result.current.createSession(
        baseActivity(),
        TEACHER_UID,
        [],
        undefined,
        'A',
        [],
        [],
        [],
        'view-only'
      );
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as VideoActivitySession;
    expect(payload.mode).toBe('view-only');
  });
});

describe('useVideoActivitySessionTeacher — subscribeToActivitySessions', () => {
  it('sets loading and wires the query with activityId/teacherUid filters ordered by createdAt desc', () => {
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    act(() => {
      result.current.subscribeToActivitySessions(ACTIVITY_ID, TEACHER_UID);
    });

    expect(result.current.sessionsLoading).toBe(true);
    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'video_activity_sessions'
    );
    expect(mockWhere).toHaveBeenCalledWith('activityId', '==', ACTIVITY_ID);
    expect(mockWhere).toHaveBeenCalledWith('teacherUid', '==', TEACHER_UID);
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('maps snapshot docs through normalizeVideoActivitySession and clears loading', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    act(() => {
      result.current.subscribeToActivitySessions(ACTIVITY_ID, TEACHER_UID);
    });
    act(() => {
      cb(
        fakeSnap([
          {
            id: 'sess-a',
            data: {
              activityId: ACTIVITY_ID,
              activityTitle: 'Full Activity',
              teacherUid: TEACHER_UID,
              assignmentName: 'Named',
              status: 'active',
              createdAt: 5,
            },
          },
        ])
      );
    });

    expect(result.current.sessionsLoading).toBe(false);
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]).toMatchObject({
      id: 'sess-a',
      activityId: ACTIVITY_ID,
      activityTitle: 'Full Activity',
      assignmentName: 'Named',
      status: 'active',
      createdAt: 5,
    });
    // Normalizer fills required defaults.
    expect(result.current.sessions[0]?.allowedPins).toEqual([]);
    expect(result.current.sessions[0]?.questions).toEqual([]);
  });

  it('uses the Firestore doc id over any stale id in the data', () => {
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return () => undefined;
    });
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    act(() => {
      result.current.subscribeToActivitySessions(ACTIVITY_ID, TEACHER_UID);
    });
    act(() => {
      cb(fakeSnap([{ id: 'real-id', data: { id: 'stale-id' } }]));
    });

    expect(result.current.sessions[0]?.id).toBe('real-id');
  });

  it('logs, clears sessions, and clears loading on listener error', () => {
    let errCb: ((e: unknown) => void) | undefined;
    mockOnSnapshot.mockImplementation((_q, _onNext, onError) => {
      errCb = onError;
      return () => undefined;
    });
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    act(() => {
      result.current.subscribeToActivitySessions(ACTIVITY_ID, TEACHER_UID);
    });
    act(() => {
      errCb?.(new Error('boom'));
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.sessionsLoading).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[useVideoActivitySessionTeacher] Activity session list error:',
      expect.any(Error)
    );
  });

  it('tears down a previous listener when re-subscribing', () => {
    const firstUnsub = vi.fn();
    const secondUnsub = vi.fn();
    mockOnSnapshot
      .mockReturnValueOnce(firstUnsub)
      .mockReturnValueOnce(secondUnsub);
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    act(() => {
      result.current.subscribeToActivitySessions(ACTIVITY_ID, TEACHER_UID);
    });
    act(() => {
      result.current.subscribeToActivitySessions('act-2', TEACHER_UID);
    });

    expect(firstUnsub).toHaveBeenCalledTimes(1);
    expect(secondUnsub).not.toHaveBeenCalled();
  });
});

describe('useVideoActivitySessionTeacher — unsubscribeFromActivitySessions', () => {
  it('tears down the active listener and resets state', () => {
    const unsub = vi.fn();
    let cb: (snap: unknown) => void = () => undefined;
    mockOnSnapshot.mockImplementation((_q, onNext) => {
      cb = onNext;
      return unsub;
    });
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    act(() => {
      result.current.subscribeToActivitySessions(ACTIVITY_ID, TEACHER_UID);
    });
    act(() => {
      cb(fakeSnap([{ id: 'sess-a', data: {} }]));
    });
    expect(result.current.sessions).toHaveLength(1);

    act(() => {
      result.current.unsubscribeFromActivitySessions();
    });

    expect(unsub).toHaveBeenCalledTimes(1);
    expect(result.current.sessions).toEqual([]);
    expect(result.current.sessionsLoading).toBe(false);
  });
});

describe('useVideoActivitySessionTeacher — renameSession', () => {
  it('updates the session doc with a trimmed assignment name', async () => {
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await act(async () => {
      await result.current.renameSession('sess-9', '  New Name  ');
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockUpdateDoc.mock.calls[0] ?? [];
    expect(path).toBe('video_activity_sessions/sess-9');
    expect(payload).toEqual({ assignmentName: 'New Name' });
  });
});

describe('useVideoActivitySessionTeacher — endSession', () => {
  it('marks the session ended with endedAt and expiresAt timestamps', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000123);
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await act(async () => {
      await result.current.endSession('sess-3');
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [path, payload] = mockUpdateDoc.mock.calls[0] ?? [];
    expect(path).toBe('video_activity_sessions/sess-3');
    expect(payload).toEqual({
      status: 'ended',
      endedAt: 1700000000123,
      expiresAt: 1700000000123,
    });
  });
});

describe('useVideoActivitySessionTeacher — subscribeToSession', () => {
  // subscribeToSession arms TWO listeners: responses (first onSnapshot call)
  // then the session doc (second call). Capture both callback sets.
  const renderSubscribed = (sessionId = 'sess-x') => {
    const calls: Array<{
      onNext: (snap: unknown) => void;
      onError: (e: unknown) => void;
      unsub: Mock;
    }> = [];
    mockOnSnapshot.mockImplementation((_ref, onNext, onError) => {
      const unsub = vi.fn();
      calls.push({ onNext, onError, unsub });
      return unsub;
    });
    const hook = renderHook(() => useVideoActivitySessionTeacher());
    act(() => {
      hook.result.current.subscribeToSession(sessionId);
    });
    return {
      ...hook,
      responsesListener: () => calls[0],
      sessionDocListener: () => calls[1],
    };
  };

  it('arms responses + session-doc listeners and sets loading', () => {
    const { result, responsesListener, sessionDocListener } =
      renderSubscribed('sess-x');

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'video_activity_sessions',
      'sess-x',
      'responses'
    );
    expect(mockDoc).toHaveBeenCalledWith(
      { __mock: 'db' },
      'video_activity_sessions',
      'sess-x'
    );
    expect(responsesListener()).toBeDefined();
    expect(sessionDocListener()).toBeDefined();
  });

  it('maps responses carrying _responseKey from the doc id and clears loading', () => {
    const { result, responsesListener } = renderSubscribed();

    act(() => {
      responsesListener().onNext(
        fakeSnap([
          { id: 'pin-P1-1234', data: { studentUid: 'anon', answers: [] } },
          { id: 'uid-2', data: { studentUid: 'uid-2', answers: [] } },
        ])
      );
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.responses).toHaveLength(2);
    expect(result.current.responses[0]?._responseKey).toBe('pin-P1-1234');
    expect(result.current.responses[1]?._responseKey).toBe('uid-2');
  });

  it('sets error and clears loading when the responses listener fails', () => {
    const { result, responsesListener } = renderSubscribed();

    act(() => {
      responsesListener().onError(new Error('responses boom'));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('responses boom');
  });

  it('mirrors the session doc into liveSession and clears it when the doc is gone', () => {
    const { result, sessionDocListener } = renderSubscribed('sess-x');

    act(() => {
      sessionDocListener().onNext(
        fakeDocSnap('sess-x', {
          activityId: ACTIVITY_ID,
          activityTitle: 'Live One',
          teacherUid: TEACHER_UID,
          status: 'active',
          createdAt: 9,
        })
      );
    });
    expect(result.current.liveSession?.id).toBe('sess-x');
    expect(result.current.liveSession?.activityTitle).toBe('Live One');

    act(() => {
      sessionDocListener().onNext(fakeDocSnap('sess-x', null));
    });
    expect(result.current.liveSession).toBeNull();
  });

  it('sets error when the session-doc listener fails', () => {
    const { result, sessionDocListener } = renderSubscribed();

    act(() => {
      sessionDocListener().onError(new Error('session boom'));
    });

    expect(result.current.error).toBe('session boom');
  });

  it('clears stale responses/liveSession and tears down prior listeners on re-subscribe', () => {
    const calls: Array<{ unsub: Mock }> = [];
    mockOnSnapshot.mockImplementation(() => {
      const unsub = vi.fn();
      calls.push({ unsub });
      return unsub;
    });
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    act(() => {
      result.current.subscribeToSession('sess-1');
    });
    act(() => {
      result.current.subscribeToSession('sess-2');
    });

    // First responses + session-doc listeners are both torn down.
    expect(calls[0]?.unsub).toHaveBeenCalledTimes(1);
    expect(calls[1]?.unsub).toHaveBeenCalledTimes(1);
    expect(calls[2]?.unsub).not.toHaveBeenCalled();
    expect(result.current.responses).toEqual([]);
    expect(result.current.liveSession).toBeNull();
  });
});

describe('useVideoActivitySessionTeacher — unsubscribeFromSession', () => {
  it('tears down both listeners and resets responses/liveSession/error', () => {
    const calls: Array<{ unsub: Mock; onError: (e: unknown) => void }> = [];
    mockOnSnapshot.mockImplementation((_ref, _onNext, onError) => {
      const unsub = vi.fn();
      calls.push({ unsub, onError });
      return unsub;
    });
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    act(() => {
      result.current.subscribeToSession('sess-1');
    });
    act(() => {
      // Drive an error so we can confirm it is cleared on unsubscribe.
      calls[0]?.onError(new Error('boom'));
    });
    expect(result.current.error).toBe('boom');

    act(() => {
      result.current.unsubscribeFromSession();
    });

    expect(calls[0]?.unsub).toHaveBeenCalledTimes(1);
    expect(calls[1]?.unsub).toHaveBeenCalledTimes(1);
    expect(result.current.responses).toEqual([]);
    expect(result.current.liveSession).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useVideoActivitySessionTeacher — unlockStudentAttempt', () => {
  it('throws when the student response doc is missing', async () => {
    mockGetDoc.mockResolvedValueOnce(fakeDocSnap('rk', null));
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await expect(
      act(async () => {
        await result.current.unlockStudentAttempt('sess-1', 'rk');
      })
    ).rejects.toThrow(/Student response not found/);
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('refunds an attempt on the response doc and the ledger when the ledger exists', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000999);
    // 1) response doc, 2) ledger doc
    mockGetDoc
      .mockResolvedValueOnce(
        fakeDocSnap('rk', {
          studentUid: 'student-9',
          completedAttempts: 2,
        })
      )
      .mockResolvedValueOnce(fakeDocSnap('led', { completedAttempts: 3 }));
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await act(async () => {
      await result.current.unlockStudentAttempt('sess-1', 'rk');
    });

    // Response doc update — refund one attempt and stamp the unlock fields.
    const responsePath = 'video_activity_sessions/sess-1/responses/rk';
    expect(batchUpdate).toHaveBeenCalledWith(responsePath, {
      completedAt: null,
      score: null,
      completedAttempts: 1,
      unlocked: true,
      unlockedAt: 1700000000999,
    });
    // Ledger refund keyed by `${sessionId}__${studentUid}`.
    expect(batchUpdate).toHaveBeenCalledWith(
      'video_activity_attempt_ledger/sess-1__student-9',
      { completedAttempts: 2 }
    );
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('updates only the response doc when no ledger entry exists', async () => {
    mockGetDoc
      .mockResolvedValueOnce(
        fakeDocSnap('rk', {
          studentUid: 'student-9',
          completedAttempts: 1,
        })
      )
      .mockResolvedValueOnce(fakeDocSnap('led', null));
    const { result } = renderHook(() => useVideoActivitySessionTeacher());

    await act(async () => {
      await result.current.unlockStudentAttempt('sess-1', 'rk');
    });

    // Only the response update — no ledger update call.
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    expect(batchUpdate).toHaveBeenCalledWith(
      'video_activity_sessions/sess-1/responses/rk',
      expect.objectContaining({ completedAttempts: 0, unlocked: true })
    );
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });
});

describe('useVideoActivitySessionTeacher — unmount cleanup', () => {
  it('unsubscribes active listeners when the hook unmounts', () => {
    const unsubs: Mock[] = [];
    mockOnSnapshot.mockImplementation(() => {
      const unsub = vi.fn();
      unsubs.push(unsub);
      return unsub;
    });
    const { result, unmount } = renderHook(() =>
      useVideoActivitySessionTeacher()
    );

    act(() => {
      result.current.subscribeToActivitySessions(ACTIVITY_ID, TEACHER_UID);
    });
    act(() => {
      result.current.subscribeToSession('sess-1');
    });

    unmount();
    // activity-session listener + responses listener + session-doc listener.
    expect(unsubs).toHaveLength(3);
    unsubs.forEach((u) => expect(u).toHaveBeenCalledTimes(1));
  });
});

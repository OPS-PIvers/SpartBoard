import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useLiveSession } from '@/hooks/useLiveSession';
import { auth } from '@/config/firebase';

vi.mock('firebase/firestore');

describe('useLiveSession — joinSession input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth as unknown as { currentUser: { uid: string } | null }).currentUser = {
      uid: 'student-uid-1',
    };

    // onSnapshot is invoked on mount for the session subscription.
    // Return a no-op unsubscribe and do not fire a snapshot so state stays pristine.
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

  it('throws "Invalid code format" when the code is empty or whitespace', async () => {
    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('1234', '   ')).rejects.toThrow(
      'Invalid code format'
    );
  });

  it('throws "Invalid code format" when the code contains only special characters', async () => {
    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('1234', '!!!---')).rejects.toThrow(
      'Invalid code format'
    );
  });

  it('throws "Session not found" when the query returns no matching session', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ empty: true, docs: [] });

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('1234', 'ABC123')).rejects.toThrow(
      'Session not found'
    );
  });

  it('throws "PIN is required" when the PIN is empty after trimming', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'teacher-uid-1', data: () => ({ isActive: true }) }],
    });

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('   ', 'ABC123')).rejects.toThrow(
      'PIN is required'
    );
  });

  it('throws when no authenticated user is available', async () => {
    (auth as unknown as { currentUser: null }).currentUser = null;

    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'teacher-uid-1', data: () => ({ isActive: true }) }],
    });

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('1234', 'ABC123')).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('rejects a duplicate PIN already held by a different student', async () => {
    // First getDocs: session lookup
    // Second getDocs: existing students list with duplicate PIN
    (firestore.getDocs as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'teacher-uid-1', data: () => ({ isActive: true }) }],
      })
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'other-student-uid',
            data: () => ({ pin: '1234' }),
          },
        ],
      });

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('1234', 'ABC123')).rejects.toThrow(
      /PIN "1234" is already in use/
    );
  });

  it('allows the same user to rejoin with their own previously-used PIN', async () => {
    (firestore.getDocs as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'teacher-uid-1', data: () => ({ isActive: true }) }],
      })
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'student-uid-1', // same uid as auth.currentUser
            data: () => ({ pin: '1234' }),
          },
        ],
      });
    (
      firestore.setDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    let teacherId = '';
    await act(async () => {
      teacherId = await result.current.joinSession('1234', 'ABC123');
    });
    expect(teacherId).toBe('teacher-uid-1');
  });

  it('normalizes the code to uppercase and strips non-alphanumeric characters before querying', async () => {
    (firestore.getDocs as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'teacher-uid-1', data: () => ({ isActive: true }) }],
      })
      .mockResolvedValueOnce({ docs: [] });
    (
      firestore.setDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'abc-123')
    );
    await act(async () => {
      await result.current.joinSession('5678', '  abc-123!!  ');
    });

    const whereCalls = (firestore.where as unknown as ReturnType<typeof vi.fn>)
      .mock.calls;
    const codeEqualsCall = whereCalls.find(
      (args) => args[0] === 'code' && args[1] === '=='
    );
    expect(codeEqualsCall).toBeDefined();
    expect(codeEqualsCall?.[2]).toBe('ABC123');
  });

  it('truncates a PIN longer than MAX_PIN_LENGTH (10) before writing', async () => {
    (firestore.getDocs as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'teacher-uid-1', data: () => ({ isActive: true }) }],
      })
      .mockResolvedValueOnce({ docs: [] });
    const setDocMock = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await act(async () => {
      await result.current.joinSession('123456789012345', 'ABC123');
    });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const writtenStudent = setDocMock.mock.calls[0][1] as { pin: string };
    expect(writtenStudent.pin).toBe('1234567890');
    expect(writtenStudent.pin.length).toBe(10);
  });

  it('throws "Session not found" when every code match is a stale, inactive session', async () => {
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'teacher-uid-1', data: () => ({ isActive: false }) }],
    });

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('1234', 'ABC123')).rejects.toThrow(
      'Session not found'
    );
  });

  it('skips a stale inactive session and joins the active one sharing the same code', async () => {
    (firestore.getDocs as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        empty: false,
        docs: [
          { id: 'ended-teacher', data: () => ({ isActive: false }) },
          { id: 'live-teacher', data: () => ({ isActive: true }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [] });
    (
      firestore.setDoc as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    let teacherId = '';
    await act(async () => {
      teacherId = await result.current.joinSession('1234', 'ABC123');
    });
    expect(teacherId).toBe('live-teacher');
  });
});

describe('useLiveSession — startSession join-code collision avoidance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    (firestore.setDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );
    (firestore.getDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { exists: () => false }
    );
  });

  it('probes for an active session already using the candidate code, and retries on collision', async () => {
    const getDocsMock = firestore.getDocs as unknown as ReturnType<
      typeof vi.fn
    >;
    // 1) clearing old students for this teacher (unrelated to code allocation)
    // 2) first candidate collides with another teacher's active session
    // 3) second candidate is free
    getDocsMock
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [{ id: 'other-teacher', data: () => ({ isActive: true }) }],
      })
      .mockResolvedValueOnce({ docs: [] });

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );

    let session: { code: string } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-1', 'clock');
    });

    // A collision-checking implementation probes Firestore for the
    // candidate code (in addition to the unrelated student-clearing
    // query) before ever writing the session document.
    expect(getDocsMock).toHaveBeenCalledTimes(3);
    expect(session?.code).toBeTruthy();
  });

  it('accepts the first candidate outright when no active session shares it', async () => {
    const getDocsMock = firestore.getDocs as unknown as ReturnType<
      typeof vi.fn
    >;
    getDocsMock
      .mockResolvedValueOnce({ docs: [] }) // clear old students
      .mockResolvedValueOnce({ docs: [] }); // no collision

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );

    await act(async () => {
      await result.current.startSession('widget-1', 'clock');
    });

    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to an unchecked code after exhausting all 5 collision-retry attempts', async () => {
    const getDocsMock = firestore.getDocs as unknown as ReturnType<
      typeof vi.fn
    >;
    const collision = {
      docs: [{ id: 'other-teacher', data: () => ({ isActive: true }) }],
    };
    getDocsMock
      .mockResolvedValueOnce({ docs: [] }) // clear old students
      .mockResolvedValueOnce(collision) // attempt 1
      .mockResolvedValueOnce(collision) // attempt 2
      .mockResolvedValueOnce(collision) // attempt 3
      .mockResolvedValueOnce(collision) // attempt 4
      .mockResolvedValueOnce(collision); // attempt 5 — retries exhausted

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );

    let session: { code: string } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-1', 'clock');
    });

    // All 5 retries collided; the last-resort fallback still returns a
    // (theoretically uncollision-checked) code rather than blocking the
    // teacher from starting the session.
    expect(getDocsMock).toHaveBeenCalledTimes(6);
    expect(session?.code).toBeTruthy();
  });
});

describe('useLiveSession — teacher student-list reference stability', () => {
  type SnapshotCallback = (snapshot: {
    docs: { id: string; data: () => Record<string, unknown> }[];
  }) => void;

  // Captures the onSnapshot listener callbacks in registration order so a test
  // can drive the session and students subscriptions independently.
  let snapshotCallbacks: SnapshotCallback[];

  const makeStudentDoc = (id: string, data: Record<string, unknown>) => ({
    id,
    data: () => data,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    snapshotCallbacks = [];

    (
      firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((_ref: unknown, cb: SnapshotCallback) => {
      snapshotCallbacks.push(cb);
      return vi.fn();
    });

    (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
    (
      firestore.collection as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({});
  });

  it('does not allocate a new students array when an identical snapshot arrives', () => {
    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );

    // 1st onSnapshot registration is the session subscription; fire it active so
    // the teacher students subscription mounts.
    const fireSession = snapshotCallbacks[0] as unknown as (snap: {
      exists: () => boolean;
      data: () => Record<string, unknown>;
    }) => void;
    act(() => {
      fireSession({
        exists: () => true,
        data: () => ({ id: 'teacher-uid-1', isActive: true }),
      });
    });

    // 2nd registration is the students subscription.
    const fireStudents = snapshotCallbacks[1];
    const snapshot = {
      docs: [
        makeStudentDoc('s1', {
          pin: '1234',
          status: 'active',
          joinedAt: 100,
          lastActive: 200,
        }),
      ],
    };
    act(() => {
      fireStudents(snapshot);
    });

    const firstRef = result.current.students;
    expect(firstRef).toHaveLength(1);

    // Re-deliver an equivalent snapshot — same values, fresh doc objects.
    const equivalentSnapshot = {
      docs: [
        makeStudentDoc('s1', {
          pin: '1234',
          status: 'active',
          joinedAt: 100,
          lastActive: 200,
        }),
      ],
    };
    act(() => {
      fireStudents(equivalentSnapshot);
    });

    // No change => the same array reference is preserved (no re-render churn).
    expect(result.current.students).toBe(firstRef);
  });

  it('allocates a new students array when a tracked property changes', () => {
    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );

    const fireSession = snapshotCallbacks[0] as unknown as (snap: {
      exists: () => boolean;
      data: () => Record<string, unknown>;
    }) => void;
    act(() => {
      fireSession({
        exists: () => true,
        data: () => ({ id: 'teacher-uid-1', isActive: true }),
      });
    });

    const fireStudents = snapshotCallbacks[1];
    act(() => {
      fireStudents({
        docs: [
          makeStudentDoc('s1', {
            pin: '1234',
            status: 'active',
            joinedAt: 100,
            lastActive: 200,
          }),
        ],
      });
    });
    const firstRef = result.current.students;

    // status changes => a new array must be produced.
    act(() => {
      fireStudents({
        docs: [
          makeStudentDoc('s1', {
            pin: '1234',
            status: 'frozen',
            joinedAt: 100,
            lastActive: 200,
          }),
        ],
      });
    });

    expect(result.current.students).not.toBe(firstRef);
    expect(result.current.students[0].status).toBe('frozen');
  });
});

describe('useLiveSession — switching the broadcast widget', () => {
  const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    asMock(firestore.onSnapshot).mockImplementation(() => vi.fn());
    asMock(firestore.doc).mockReturnValue({});
    asMock(firestore.collection).mockReturnValue({});
    asMock(firestore.query).mockReturnValue({});
    asMock(firestore.where).mockReturnValue({});
    asMock(firestore.setDoc).mockResolvedValue(undefined);
    asMock(firestore.updateDoc).mockResolvedValue(undefined);
    asMock(firestore.deleteDoc).mockResolvedValue(undefined);
    asMock(firestore.getDocs).mockResolvedValue({ docs: [] });
  });

  it('keeps the roster and join code when already live on another widget', async () => {
    asMock(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({
        id: 'teacher-uid-1',
        isActive: true,
        activeWidgetId: 'widget-1',
        activeWidgetType: 'clock',
        code: 'KEEP12',
        frozen: true,
        createdAt: 5,
      }),
    });

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );
    let session: { code: string; activeWidgetId: string | null } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-2', 'poll');
    });

    expect(firestore.deleteDoc).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(firestore.getDocs).not.toHaveBeenCalled();
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        activeWidgetId: 'widget-2',
        activeWidgetType: 'poll',
        frozen: false,
      })
    );
    expect(session?.code).toBe('KEEP12');
    expect(session?.activeWidgetId).toBe('widget-2');
  });

  it('clears the roster and mints a new code when the session had ended', async () => {
    asMock(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ isActive: false, code: 'OLD123' }),
    });
    asMock(firestore.getDocs)
      .mockResolvedValueOnce({ docs: [{ ref: 'student-ref' }] })
      .mockResolvedValue({ docs: [] });

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );
    await act(async () => {
      await result.current.startSession('widget-2', 'poll');
    });

    expect(firestore.deleteDoc).toHaveBeenCalledWith('student-ref');
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isActive: true, activeWidgetId: 'widget-2' })
    );
  });
});

describe('useLiveSession — student removal and leaving', () => {
  const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
  let pushMyDoc: ((exists: boolean, status?: string) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    pushMyDoc = null;
    (auth as unknown as { currentUser: { uid: string } }).currentUser = {
      uid: 'student-uid-1',
    };
    asMock(firestore.doc).mockImplementation((...args: unknown[]) => ({
      path: args.slice(1).join('/'),
    }));
    asMock(firestore.collection).mockReturnValue({});
    asMock(firestore.query).mockReturnValue({});
    asMock(firestore.where).mockReturnValue({});
    asMock(firestore.setDoc).mockResolvedValue(undefined);
    asMock(firestore.getDocs)
      .mockResolvedValueOnce({
        docs: [{ id: 'teacher-uid-1', data: () => ({ isActive: true }) }],
      })
      .mockResolvedValue({ docs: [] });
    asMock(firestore.onSnapshot).mockImplementation(
      (ref: { path?: string }, cb: (snap: unknown) => void) => {
        if (ref.path?.includes('/students/')) {
          pushMyDoc = (exists, status = 'active') =>
            cb({
              exists: () => exists,
              data: () => ({ pin: '1234', status }),
            });
        }
        return vi.fn();
      }
    );
  });

  const joinAsStudent = async () => {
    const hook = renderHook(() =>
      useLiveSession(undefined, 'student', 'teacher-uid-1')
    );
    await act(async () => {
      await hook.result.current.joinSession('1234', 'ABC123');
    });
    return hook;
  };

  it('returns a removed student to the join screen, even while frozen', async () => {
    const { result } = await joinAsStudent();
    act(() => pushMyDoc?.(true, 'frozen'));
    expect(result.current.individualFrozen).toBe(true);
    expect(result.current.studentId).toBe('student-uid-1');

    act(() => pushMyDoc?.(false));
    expect(result.current.studentId).toBeNull();
    expect(result.current.individualFrozen).toBe(false);
  });

  it('leaves locally even when the disconnect write fails', async () => {
    asMock(firestore.updateDoc).mockRejectedValue(new Error('not-found'));
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { result } = await joinAsStudent();
    act(() => pushMyDoc?.(true, 'frozen'));

    await act(async () => {
      await result.current.leaveSession();
    });
    expect(result.current.studentId).toBeNull();
    expect(result.current.individualFrozen).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('useLiveSession — student follows the teacher', () => {
  const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
  let pushSession: ((data: Record<string, unknown> | null) => void) | null;
  let pushMyDoc: ((exists: boolean, status?: string) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    pushSession = null;
    pushMyDoc = null;
    (auth as unknown as { currentUser: { uid: string } }).currentUser = {
      uid: 'student-uid-1',
    };
    asMock(firestore.doc).mockImplementation((...args: unknown[]) => ({
      path: args.slice(1).join('/'),
    }));
    asMock(firestore.collection).mockReturnValue({});
    asMock(firestore.query).mockReturnValue({});
    asMock(firestore.where).mockReturnValue({});
    asMock(firestore.setDoc).mockResolvedValue(undefined);
    asMock(firestore.updateDoc).mockResolvedValue(undefined);
    asMock(firestore.getDocs)
      .mockResolvedValueOnce({
        docs: [{ id: 'teacher-uid-1', data: () => ({ isActive: true }) }],
      })
      .mockResolvedValue({ docs: [] });
    asMock(firestore.onSnapshot).mockImplementation(
      (ref: { path?: string }, cb: (snap: unknown) => void) => {
        if (ref.path?.includes('/students/')) {
          pushMyDoc = (exists, status = 'active') =>
            cb({
              exists: () => exists,
              data: () => ({ pin: '1234', status }),
            });
        } else {
          pushSession = (data) =>
            cb({ exists: () => data !== null, data: () => data });
        }
        return vi.fn();
      }
    );
  });

  const live = (over: Record<string, unknown> = {}) => ({
    id: 'teacher-uid-1',
    isActive: true,
    activeWidgetId: 'w1',
    activeWidgetType: 'clock',
    code: 'ABC123',
    frozen: false,
    createdAt: 1,
    ...over,
  });

  const joinAndWatch = async () => {
    const hook = renderHook(() =>
      useLiveSession(undefined, 'student', 'teacher-uid-1')
    );
    act(() => pushSession?.(live()));
    await act(async () => {
      await hook.result.current.joinSession('1234', 'ABC123');
    });
    act(() => pushMyDoc?.(true, 'active'));
    return hook;
  };

  it('stops loading on the first session snapshot', () => {
    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'teacher-uid-1')
    );
    expect(result.current.loading).toBe(true);
    act(() => pushSession?.(live()));
    expect(result.current.loading).toBe(false);
    expect(result.current.session?.activeWidgetId).toBe('w1');
  });

  it('keeps the student joined when the teacher ends, and marks them unfrozen on disconnect', async () => {
    const { result } = await joinAndWatch();
    act(() => pushMyDoc?.(true, 'frozen'));
    act(() => pushSession?.(live({ isActive: false, activeWidgetId: null })));
    act(() => pushMyDoc?.(true, 'disconnected'));
    expect(result.current.studentId).toBe('student-uid-1');
    expect(result.current.session?.isActive).toBe(false);
    expect(result.current.individualFrozen).toBe(false);
  });

  it('follows a widget switch without rejoining', async () => {
    const { result } = await joinAndWatch();
    act(() => pushSession?.(live({ activeWidgetId: 'w2' })));
    expect(result.current.studentId).toBe('student-uid-1');
    expect(result.current.studentPin).toBe('1234');
    expect(result.current.session?.activeWidgetId).toBe('w2');
  });

  it('keeps a personal freeze when the class freeze lifts', async () => {
    const { result } = await joinAndWatch();
    act(() => pushMyDoc?.(true, 'frozen'));
    act(() => pushSession?.(live({ frozen: true })));
    act(() => pushSession?.(live({ frozen: false })));
    expect(result.current.individualFrozen).toBe(true);
    expect(result.current.session?.frozen).toBe(false);
  });

  it('keeps the session through a removal, so a rejoin shows the live widget', async () => {
    const { result } = await joinAndWatch();
    act(() => pushMyDoc?.(false));
    expect(result.current.studentId).toBeNull();
    expect(result.current.studentPin).toBeNull();
    expect(result.current.session?.activeWidgetId).toBe('w1');

    asMock(firestore.getDocs).mockResolvedValueOnce({
      docs: [{ id: 'teacher-uid-1', data: () => ({ isActive: true }) }],
    });
    await act(async () => {
      await result.current.joinSession('1234', 'ABC123');
    });
    act(() => pushMyDoc?.(true, 'active'));
    expect(result.current.studentId).toBe('student-uid-1');
    expect(result.current.session?.activeWidgetId).toBe('w1');
  });

  it('ignores leave before joining', async () => {
    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'teacher-uid-1')
    );
    act(() => pushSession?.(live()));
    await act(async () => {
      await result.current.leaveSession();
    });
    expect(firestore.updateDoc).not.toHaveBeenCalled();
    expect(result.current.session?.activeWidgetId).toBe('w1');
  });
});

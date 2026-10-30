import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useLiveSession } from '@/hooks/useLiveSession';
import { auth } from '@/config/firebase';

vi.mock('firebase/firestore');

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

// Path-aware refs, so getDoc can answer the code pointer and the session doc separately.
const mockDocPaths = () =>
  asMock(firestore.doc).mockImplementation((...args: unknown[]) => ({
    path: args.slice(1).join('/'),
  }));

// The join lookup: live_session_codes/{code} names the owner, then sessions/{owner}.
const mockJoinLookup = (
  teacherUid: string | null,
  session: Record<string, unknown> | null = { isActive: true, code: 'ABC123' }
) => {
  mockDocPaths();
  asMock(firestore.getDoc).mockImplementation((ref: { path: string }) =>
    Promise.resolve(
      ref.path.startsWith('live_session_codes/')
        ? { exists: () => teacherUid !== null, data: () => ({ teacherUid }) }
        : { exists: () => session !== null, data: () => session }
    )
  );
};

const mockBatch = () => {
  const batch = {
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  asMock(firestore.writeBatch).mockReturnValue(batch);
  return batch;
};

describe('useLiveSession — joinSession input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth as unknown as { currentUser: { uid: string } | null }).currentUser = {
      uid: 'student-uid-1',
    };

    // onSnapshot is invoked on mount for the session subscription.
    // Return a no-op unsubscribe and do not fire a snapshot so state stays pristine.
    asMock(firestore.onSnapshot).mockImplementation(() => vi.fn());
    asMock(firestore.collection).mockReturnValue({});
    mockJoinLookup('teacher-uid-1');
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

  it('throws "Session not found" when no teacher owns the code', async () => {
    mockJoinLookup(null);

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('1234', 'ABC123')).rejects.toThrow(
      'Session not found'
    );
  });

  it('throws "PIN is required" when the PIN is empty after trimming', async () => {
    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('   ', 'ABC123')).rejects.toThrow(
      'PIN is required'
    );
  });

  it('throws when no authenticated user is available', async () => {
    (auth as unknown as { currentUser: null }).currentUser = null;

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('1234', 'ABC123')).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('joins without listing the session roster, which only the teacher may read', async () => {
    asMock(firestore.setDoc).mockResolvedValueOnce(undefined);
    const getDocsMock = asMock(firestore.getDocs);

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    let teacherId = '';
    await act(async () => {
      teacherId = await result.current.joinSession('1234', 'ABC123');
    });
    expect(teacherId).toBe('teacher-uid-1');
    expect(getDocsMock).not.toHaveBeenCalled();
  });

  it('normalizes the code to uppercase and strips non-alphanumeric characters before the lookup', async () => {
    asMock(firestore.setDoc).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'abc-123')
    );
    await act(async () => {
      await result.current.joinSession('5678', '  abc-123!!  ');
    });

    expect(firestore.getDoc).toHaveBeenCalledWith({
      path: 'live_session_codes/ABC123',
    });
  });

  it('truncates a PIN longer than MAX_PIN_LENGTH (10) before writing', async () => {
    const setDocMock = asMock(firestore.setDoc);
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

  it('throws "Session not found" when rules refuse the join record (ended or moved code)', async () => {
    asMock(firestore.setDoc).mockRejectedValueOnce({
      code: 'permission-denied',
    });

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    await expect(result.current.joinSession('1234', 'ABC123')).rejects.toThrow(
      'Session not found'
    );
  });

  it("joins the code owner's session by a join record carrying the code, never reading or querying sessions first", async () => {
    const setDocMock = asMock(firestore.setDoc);
    setDocMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useLiveSession(undefined, 'student', 'ABC123')
    );
    let teacherId = '';
    await act(async () => {
      teacherId = await result.current.joinSession('1234', 'abc123');
    });
    expect(teacherId).toBe('teacher-uid-1');
    expect(firestore.query).not.toHaveBeenCalled();
    expect(firestore.getDoc).not.toHaveBeenCalledWith({
      path: 'sessions/teacher-uid-1',
    });
    expect(setDocMock.mock.calls[0][1]).toMatchObject({
      code: 'ABC123',
      status: 'active',
    });
  });
});

describe('useLiveSession — endSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(firestore.onSnapshot).mockImplementation(() => vi.fn());
    asMock(firestore.collection).mockReturnValue({});
    asMock(firestore.getDocs).mockResolvedValue({ docs: [] });
    asMock(firestore.deleteDoc).mockResolvedValue(undefined);
    asMock(firestore.deleteField).mockReturnValue('<deleteField>');
    mockJoinLookup('teacher-uid', { isActive: true, code: 'LIVE01' });
  });

  it('clears the widget config and frees the join code', async () => {
    asMock(firestore.updateDoc).mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLiveSession('teacher-uid', 'teacher')
    );
    await act(async () => {
      await result.current.endSession();
    });

    expect(firestore.updateDoc).toHaveBeenCalledWith(
      { path: 'sessions/teacher-uid' },
      {
        isActive: false,
        activeWidgetId: null,
        activeWidgetType: null,
        activeWidgetConfig: '<deleteField>',
        frozen: false,
      }
    );
    expect(firestore.deleteDoc).toHaveBeenCalledWith({
      path: 'live_session_codes/LIVE01',
    });
  });

  it('keeps the join code when ending fails', async () => {
    asMock(firestore.updateDoc).mockRejectedValueOnce(new Error('offline'));
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() =>
      useLiveSession('teacher-uid', 'teacher')
    );
    await act(async () => {
      await result.current.endSession();
    });

    expect(firestore.deleteDoc).not.toHaveBeenCalledWith({
      path: 'live_session_codes/LIVE01',
    });
    errorSpy.mockRestore();
  });
});

describe('useLiveSession — startSession join-code collision avoidance', () => {
  let batch: ReturnType<typeof mockBatch>;

  beforeEach(() => {
    vi.clearAllMocks();
    asMock(firestore.onSnapshot).mockImplementation(() => vi.fn());
    mockDocPaths();
    asMock(firestore.collection).mockReturnValue({});
    asMock(firestore.getDocs).mockResolvedValue({ docs: [] });
    asMock(firestore.getDoc).mockResolvedValue({ exists: () => false });
    batch = mockBatch();
  });

  it('probes for a claimed candidate code, and retries on collision', async () => {
    const getDocMock = asMock(firestore.getDoc);
    // 1) the teacher's own session doc (none yet)
    // 2) first candidate is already claimed
    // 3) second candidate is free
    getDocMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValueOnce({ exists: () => true });

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );

    let session: { code: string } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-1', 'clock');
    });

    expect(getDocMock).toHaveBeenCalledTimes(3);
    expect(session?.code).toBeTruthy();
  });

  it('claims the code and writes the session in one batch', async () => {
    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );

    let session: { code: string } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-1', 'clock');
    });

    expect(firestore.getDoc).toHaveBeenCalledTimes(2);
    expect(batch.set).toHaveBeenCalledWith(
      { path: `live_session_codes/${session?.code}` },
      expect.objectContaining({ teacherUid: 'teacher-uid-1' })
    );
    expect(batch.set).toHaveBeenCalledWith(
      { path: 'sessions/teacher-uid-1' },
      expect.objectContaining({ isActive: true, code: session?.code })
    );
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('falls back to an unchecked code after exhausting all 5 collision-retry attempts', async () => {
    const getDocMock = asMock(firestore.getDoc);
    const claimed = { exists: () => true };
    getDocMock
      .mockResolvedValueOnce({ exists: () => false }) // own session
      .mockResolvedValueOnce(claimed) // attempt 1
      .mockResolvedValueOnce(claimed) // attempt 2
      .mockResolvedValueOnce(claimed) // attempt 3
      .mockResolvedValueOnce(claimed) // attempt 4
      .mockResolvedValueOnce(claimed); // attempt 5 — retries exhausted

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );

    let session: { code: string } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-1', 'clock');
    });

    expect(getDocMock).toHaveBeenCalledTimes(6);
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
  let batch: ReturnType<typeof mockBatch>;

  beforeEach(() => {
    vi.clearAllMocks();
    asMock(firestore.onSnapshot).mockImplementation(() => vi.fn());
    mockDocPaths();
    asMock(firestore.collection).mockReturnValue({});
    asMock(firestore.setDoc).mockResolvedValue(undefined);
    asMock(firestore.updateDoc).mockResolvedValue(undefined);
    asMock(firestore.deleteDoc).mockResolvedValue(undefined);
    asMock(firestore.getDocs).mockResolvedValue({ docs: [] });
    batch = mockBatch();
  });

  // The teacher's session doc, the owner of its code, and every other code unclaimed.
  const mockTeacherDocs = (
    session: { code: string } & Record<string, unknown>,
    codeOwner: string | null
  ) =>
    asMock(firestore.getDoc).mockImplementation((ref: { path: string }) => {
      if (ref.path === 'sessions/teacher-uid-1') {
        return Promise.resolve({ exists: () => true, data: () => session });
      }
      const owned = ref.path === `live_session_codes/${session.code}`;
      return Promise.resolve({
        exists: () => owned && codeOwner !== null,
        data: () => (owned ? { teacherUid: codeOwner } : undefined),
      });
    });

  const liveOnWidget1 = {
    id: 'teacher-uid-1',
    isActive: true,
    activeWidgetId: 'widget-1',
    activeWidgetType: 'clock',
    code: 'KEEP12',
    frozen: true,
    createdAt: 5,
  };

  it('keeps the roster and join code when already live on another widget', async () => {
    mockTeacherDocs(liveOnWidget1, 'teacher-uid-1');

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );
    let session: { code: string; activeWidgetId: string | null } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-2', 'poll');
    });

    expect(firestore.deleteDoc).not.toHaveBeenCalled();
    expect(batch.commit).not.toHaveBeenCalled();
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

  it('keeps the class live when the code-owner check fails to load', async () => {
    asMock(firestore.getDoc).mockImplementation((ref: { path: string }) =>
      ref.path === 'sessions/teacher-uid-1'
        ? Promise.resolve({ exists: () => true, data: () => liveOnWidget1 })
        : Promise.reject(new Error('unavailable'))
    );

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );
    let session: { code: string } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-2', 'poll');
    });

    expect(firestore.deleteDoc).not.toHaveBeenCalled();
    expect(batch.commit).not.toHaveBeenCalled();
    expect(session?.code).toBe('KEEP12');
  });

  it('claims an unclaimed live code in place, keeping the roster', async () => {
    mockTeacherDocs(liveOnWidget1, null);

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );
    let session: { code: string } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-2', 'poll');
    });

    expect(firestore.setDoc).toHaveBeenCalledWith(
      { path: 'live_session_codes/KEEP12' },
      expect.objectContaining({ teacherUid: 'teacher-uid-1' })
    );
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
    expect(batch.commit).not.toHaveBeenCalled();
    expect(session?.code).toBe('KEEP12');
  });

  it('still switches, keeping the roster, when another teacher owns the live code', async () => {
    mockTeacherDocs(liveOnWidget1, 'other-teacher');

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );
    let session: { code: string } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-2', 'poll');
    });

    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(firestore.getDocs).not.toHaveBeenCalled();
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
    expect(batch.commit).not.toHaveBeenCalled();
    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    expect(session?.code).toBe('KEEP12');
  });

  it('still switches, keeping the roster, when claiming the live code is refused', async () => {
    mockTeacherDocs(liveOnWidget1, null);
    asMock(firestore.setDoc).mockRejectedValueOnce(new Error('denied'));

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );
    let session: { code: string } | undefined;
    await act(async () => {
      session = await result.current.startSession('widget-2', 'poll');
    });

    expect(firestore.getDocs).not.toHaveBeenCalled();
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
    expect(batch.commit).not.toHaveBeenCalled();
    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    expect(session?.code).toBe('KEEP12');
  });

  it('keeps the old roster when the fresh-start batch is denied', async () => {
    mockTeacherDocs({ isActive: false, code: 'OLD123' }, 'teacher-uid-1');
    asMock(firestore.getDocs).mockResolvedValue({
      docs: [{ ref: 'student-ref' }],
    });
    batch.commit.mockRejectedValueOnce(new Error('denied'));

    const { result } = renderHook(() =>
      useLiveSession('teacher-uid-1', 'teacher')
    );
    await act(async () => {
      await expect(
        result.current.startSession('widget-2', 'poll')
      ).rejects.toThrow('denied');
    });

    expect(firestore.deleteDoc).not.toHaveBeenCalled();
  });

  it('clears the roster and mints a new code when the session had ended', async () => {
    mockTeacherDocs({ isActive: false, code: 'OLD123' }, 'teacher-uid-1');
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
    expect(batch.set).toHaveBeenCalledWith(
      { path: 'sessions/teacher-uid-1' },
      expect.objectContaining({ isActive: true, activeWidgetId: 'widget-2' })
    );
    expect(firestore.deleteDoc).toHaveBeenCalledWith({
      path: 'live_session_codes/OLD123',
    });
  });
});

describe('useLiveSession — teacher tab claims a pre-pointer live code', () => {
  type SessionCallback = (snap: {
    exists: () => boolean;
    data: () => Record<string, unknown>;
  }) => void;
  let callbacks: SessionCallback[];

  beforeEach(() => {
    vi.clearAllMocks();
    callbacks = [];
    asMock(firestore.onSnapshot).mockImplementation(
      (_ref: unknown, cb: SessionCallback) => {
        callbacks.push(cb);
        return vi.fn();
      }
    );
    mockDocPaths();
    asMock(firestore.collection).mockReturnValue({});
    asMock(firestore.setDoc).mockResolvedValue(undefined);
  });

  const fireLive = (code: string) =>
    act(async () => {
      callbacks[0]({
        exists: () => true,
        data: () => ({ id: 'teacher-uid-1', isActive: true, code }),
      });
      await Promise.resolve();
    });

  it('claims the code as soon as the live session loads', async () => {
    asMock(firestore.getDoc).mockResolvedValue({ exists: () => false });
    renderHook(() => useLiveSession('teacher-uid-1', 'teacher'));
    await fireLive('LIVE01');

    expect(firestore.getDoc).toHaveBeenCalledWith({
      path: 'live_session_codes/LIVE01',
    });
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { path: 'live_session_codes/LIVE01' },
      expect.objectContaining({ teacherUid: 'teacher-uid-1' })
    );
  });

  it('leaves an existing pointer alone', async () => {
    asMock(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ teacherUid: 'teacher-uid-1' }),
    });
    renderHook(() => useLiveSession('teacher-uid-1', 'teacher'));
    await fireLive('LIVE01');

    expect(firestore.getDoc).toHaveBeenCalledTimes(1);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('never claims from a student tab', async () => {
    asMock(firestore.getDoc).mockResolvedValue({ exists: () => false });
    renderHook(() => useLiveSession(undefined, 'student', 'teacher-uid-1'));
    await fireLive('LIVE01');

    expect(firestore.setDoc).not.toHaveBeenCalled();
  });
});

describe('useLiveSession — student removal and leaving', () => {
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
    asMock(firestore.setDoc).mockResolvedValue(undefined);
    asMock(firestore.getDocs).mockResolvedValue({ docs: [] });
    mockJoinLookup('teacher-uid-1');
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
    asMock(firestore.setDoc).mockResolvedValue(undefined);
    asMock(firestore.updateDoc).mockResolvedValue(undefined);
    asMock(firestore.getDocs).mockResolvedValue({ docs: [] });
    mockJoinLookup('teacher-uid-1');
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

    await act(async () => {
      await result.current.joinSession('1234', 'ABC123');
    });
    act(() => pushMyDoc?.(true, 'active'));
    expect(result.current.studentId).toBe('student-uid-1');
    expect(result.current.session?.activeWidgetId).toBe('w1');
  });

  it('re-listens to the session after a rejoin, since removal revoked the old read', async () => {
    const { result } = await joinAndWatch();
    const sessionListens = () =>
      asMock(firestore.onSnapshot).mock.calls.filter(
        ([ref]) => (ref as { path: string }).path === 'sessions/teacher-uid-1'
      ).length;
    const before = sessionListens();
    act(() => pushMyDoc?.(false));
    await act(async () => {
      await result.current.joinSession('1234', 'ABC123');
    });
    expect(sessionListens()).toBe(before + 1);
    act(() => pushSession?.(live({ activeWidgetId: 'w3' })));
    expect(result.current.session?.activeWidgetId).toBe('w3');
  });

  it('drops the old session when a student switches to another code', () => {
    const { result, rerender } = renderHook(
      ({ code }: { code: string }) =>
        useLiveSession(undefined, 'student', code),
      { initialProps: { code: 'teacher-uid-1' } }
    );
    act(() => pushSession?.(live()));
    expect(result.current.session?.activeWidgetId).toBe('w1');
    rerender({ code: 'teacher-uid-2' });
    expect(result.current.session).toBeNull();
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

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
      docs: [{ id: 'teacher-uid-1' }],
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
      docs: [{ id: 'teacher-uid-1' }],
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
        docs: [{ id: 'teacher-uid-1' }],
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
        docs: [{ id: 'teacher-uid-1' }],
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
        docs: [{ id: 'teacher-uid-1' }],
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
        docs: [{ id: 'teacher-uid-1' }],
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

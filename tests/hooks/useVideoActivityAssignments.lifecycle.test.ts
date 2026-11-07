// Pause, Resume and End run in one transaction that checks the from-state (state machine audit Q4).
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  documentId: vi.fn(),
  FieldPath: class {},
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  startAfter: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/hooks/useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

const UID = 'teacher-1';
const ROW = `users/${UID}/video_activity_assignments/a-1`;
const SESSION = 'video_activity_sessions/a-1';
const NOW = 1700000000000;

function runWith(session: unknown, assignment: unknown) {
  const tx = {
    get: vi.fn((ref: string) =>
      Promise.resolve({
        data: () => (ref === SESSION ? session : assignment),
      })
    ),
    update: vi.fn(),
  };
  (runTransaction as Mock).mockImplementation(
    (_db: unknown, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)
  );
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  (onSnapshot as Mock).mockImplementation(
    (_q: unknown, next: (snap: unknown) => void) => {
      next({ docs: [] });
      return () => undefined;
    }
  );
});

describe('video activity lifecycle', () => {
  it('pauses a live run by writing row and session in one transaction', async () => {
    const tx = runWith({ status: 'active' }, { status: 'active' });
    const { result } = renderHook(() => useVideoActivityAssignments(UID));

    await act(() => result.current.pauseAssignment('a-1'));

    expect(tx.update).toHaveBeenCalledWith(ROW, {
      status: 'paused',
      updatedAt: NOW,
    });
    expect(tx.update).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({ status: 'ended' })
    );
  });

  it('refuses a stale Pause on a run that has ended', async () => {
    const tx = runWith({ status: 'ended' }, { status: 'inactive' });
    const { result } = renderHook(() => useVideoActivityAssignments(UID));

    await act(() => result.current.pauseAssignment('a-1'));

    expect(tx.update).not.toHaveBeenCalled();
  });

  it('refuses a stale Resume on a run that has ended', async () => {
    const tx = runWith({ status: 'ended' }, { status: 'inactive' });
    const { result } = renderHook(() => useVideoActivityAssignments(UID));

    await act(() => result.current.resumeAssignment('a-1'));

    expect(tx.update).not.toHaveBeenCalled();
  });

  it('resumes a paused run', async () => {
    const tx = runWith({ status: 'ended' }, { status: 'paused' });
    const { result } = renderHook(() => useVideoActivityAssignments(UID));

    await act(() => result.current.resumeAssignment('a-1'));

    expect(tx.update).toHaveBeenCalledWith(SESSION, { status: 'active' });
  });

  it('End still writes from any state', async () => {
    const tx = runWith({ status: 'ended' }, { status: 'paused' });
    const { result } = renderHook(() => useVideoActivityAssignments(UID));

    await act(() => result.current.deactivateAssignment('a-1'));

    expect(tx.update).toHaveBeenCalledWith(ROW, {
      status: 'inactive',
      updatedAt: NOW,
    });
  });

  it('rejects when the transaction fails', async () => {
    (runTransaction as Mock).mockRejectedValue(new Error('aborted'));
    const { result } = renderHook(() => useVideoActivityAssignments(UID));

    await expect(result.current.pauseAssignment('a-1')).rejects.toThrow(
      'aborted'
    );
  });
});

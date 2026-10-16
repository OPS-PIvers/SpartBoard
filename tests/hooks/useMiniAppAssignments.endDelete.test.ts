// End and Delete write the archive row and the live session in one batch (widget state audit MA-2, MA-3, MA-5).
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((ref: unknown) => ref),
}));

vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));
vi.mock('@/hooks/useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

const TEACHER_UID = 'teacher-1';
const ROW_PATH = `users/${TEACHER_UID}/miniapp_assignments/row-1`;
const NOW = 1700000000000;

const batch = {
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(),
};

function withRows(rows: Record<string, unknown>[]) {
  (onSnapshot as Mock).mockImplementation(
    (_q: unknown, next: (snap: unknown) => void) => {
      next({
        docs: rows.map((r) => ({ id: r.id, data: () => r })),
      });
      return () => undefined;
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (collection as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  (writeBatch as Mock).mockReturnValue(batch);
  batch.commit.mockResolvedValue(undefined);
  (getDoc as Mock).mockResolvedValue({ exists: () => false });
  withRows([]);
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

describe('endAssignment', () => {
  it('ends the row and the session in one batch', async () => {
    withRows([{ id: 'row-1', sessionId: 'sess-1', status: 'active' }]);
    const { result } = renderHook(() => useMiniAppAssignments(TEACHER_UID));

    await act(() => result.current.endAssignment('row-1'));

    expect(batch.update).toHaveBeenCalledWith(ROW_PATH, {
      status: 'inactive',
      updatedAt: NOW,
    });
    expect(batch.update).toHaveBeenCalledWith('mini_app_sessions/sess-1', {
      status: 'ended',
      endedAt: NOW,
    });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('reads the row when the local list has not caught up', async () => {
    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ sessionId: 'sess-2', status: 'active' }),
    });
    const { result } = renderHook(() => useMiniAppAssignments(TEACHER_UID));

    await act(() => result.current.endAssignment('row-1'));

    expect(getDoc).toHaveBeenCalledWith(ROW_PATH);
    expect(batch.update).toHaveBeenCalledWith('mini_app_sessions/sess-2', {
      status: 'ended',
      endedAt: NOW,
    });
  });

  it('rejects when the batch fails instead of reporting success', async () => {
    withRows([{ id: 'row-1', sessionId: 'sess-1', status: 'active' }]);
    batch.commit.mockRejectedValue(new Error('permission-denied'));
    const { result } = renderHook(() => useMiniAppAssignments(TEACHER_UID));

    await expect(result.current.endAssignment('row-1')).rejects.toThrow(
      'permission-denied'
    );
  });
});

describe('deleteAssignment', () => {
  it('ends a live session in the same batch as the delete', async () => {
    withRows([{ id: 'row-1', sessionId: 'sess-1', status: 'active' }]);
    const { result } = renderHook(() => useMiniAppAssignments(TEACHER_UID));

    await act(() => result.current.deleteAssignment('row-1'));

    expect(batch.delete).toHaveBeenCalledWith(ROW_PATH);
    expect(batch.update).toHaveBeenCalledWith('mini_app_sessions/sess-1', {
      status: 'ended',
      endedAt: NOW,
    });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('leaves an already-ended session untouched', async () => {
    withRows([{ id: 'row-1', sessionId: 'sess-1', status: 'inactive' }]);
    const { result } = renderHook(() => useMiniAppAssignments(TEACHER_UID));

    await act(() => result.current.deleteAssignment('row-1'));

    expect(batch.delete).toHaveBeenCalledWith(ROW_PATH);
    expect(batch.update).not.toHaveBeenCalled();
  });
});

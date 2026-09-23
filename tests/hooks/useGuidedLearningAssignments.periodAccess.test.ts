// Per-period GL assignments: the hub mirror carries the gate, and a delete removes the
// content doc first, on its own, since no rule can reach it once the session is gone.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { useGuidedLearningAssignments } from '@/hooks/useGuidedLearningAssignments';
import type { PeriodAccess } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/firestorePaging', () => ({
  readAllDocsPaged: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/hooks/useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

const TEACHER_UID = 'teacher-1';
const PERIODS: Record<string, PeriodAccess> = {
  A: {
    state: 'open',
    openAt: null,
    closeAt: null,
    bellPeriodId: null,
    verified: true,
    label: 'P1',
  },
};
const order: string[] = [];
const batchDelete = vi.fn((ref: string) => order.push(`batch:${ref}`));
const batchCommit = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  (doc as Mock).mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
  (onSnapshot as Mock).mockReturnValue(() => undefined);
  (setDoc as Mock).mockResolvedValue(undefined);
  (deleteDoc as Mock).mockImplementation((ref: string) => {
    order.push(`delete:${ref}`);
    return Promise.resolve();
  });
  (writeBatch as Mock).mockReturnValue({
    delete: batchDelete,
    commit: batchCommit,
  });
  batchCommit.mockResolvedValue(undefined);
});

describe('useGuidedLearningAssignments — per-period sessions', () => {
  it('mirrors the period gate onto the assignment without a shared window', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.createAssignment({
        sessionId: 'a-1',
        setId: 'set-1',
        setTitle: 'Cells',
        dueAt: 9_000,
        periodGate: { accessMode: 'assessment', periodAccess: PERIODS },
      });
    });
    const written = (setDoc as Mock).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(written).toMatchObject({
      accessMode: 'assessment',
      periodAccess: PERIODS,
      dueAt: 9_000,
    });
    expect(written).not.toHaveProperty('openAt');
  });

  it('deletes the content doc before the session', async () => {
    (getDoc as Mock).mockResolvedValue({
      data: () => ({ stepsInContent: true }),
    });
    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.deleteAssignment('a-1');
    });
    expect(order).toEqual([
      'delete:guided_learning_sessions/a-1/content/steps',
      'batch:guided_learning_sessions/a-1',
      `batch:users/${TEACHER_UID}/guided_learning_assignments/a-1`,
    ]);
  });

  it('keeps the session when its content doc fails to delete', async () => {
    (getDoc as Mock).mockResolvedValue({
      data: () => ({ stepsInContent: true }),
    });
    (deleteDoc as Mock).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await expect(result.current.deleteAssignment('a-1')).rejects.toThrow(
        'offline'
      );
    });
    expect(batchDelete).not.toHaveBeenCalledWith(
      'guided_learning_sessions/a-1'
    );
  });

  it('skips the content delete on a legacy session', async () => {
    (getDoc as Mock).mockResolvedValue({ data: () => ({}) });
    const { result } = renderHook(() =>
      useGuidedLearningAssignments(TEACHER_UID)
    );
    await act(async () => {
      await result.current.deleteAssignment('a-1');
    });
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(batchDelete).toHaveBeenCalledWith('guided_learning_sessions/a-1');
  });
});

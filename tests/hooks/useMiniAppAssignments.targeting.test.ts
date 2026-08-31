/** M17 B3 — targeting/window fields on `useMiniAppAssignments.createAssignment`. */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  orderBy: vi.fn((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  })),
  query: vi.fn((_ref, ...constraints) => ({ __query: constraints })),
}));

vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));
vi.mock('@/hooks/useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockSetDoc = setDoc as Mock;
const mockUpdateDoc = updateDoc as Mock;
const mockOrderBy = orderBy as Mock;

const TEACHER_UID = 'teacher-1';

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
  mockOrderBy.mockImplementation((field: string, dir: 'asc' | 'desc') => ({
    __orderBy: { field, dir },
  }));
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    '11111111-1111-4111-8111-111111111111'
  );
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
});

describe('useMiniAppAssignments — createAssignment targeting fields', () => {
  it('omits all targeting/window fields for a default class-wide assignment', async () => {
    const { result } = renderHook(() => useMiniAppAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.createAssignment({
        sessionId: 'sess-1',
        app: { id: 'app-1', title: 'App' },
        assignmentName: 'A',
      });
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    for (const key of [
      'targetMode',
      'targetStudents',
      'targetGroupIds',
      'overridesBySourcedId',
      'dueAt',
      'openAt',
      'closeAt',
    ]) {
      expect(key in payload).toBe(false);
    }
  });

  it('writes targetMode/targetGroupIds/overrides/window when individually targeted, never targetStudents', async () => {
    const { result } = renderHook(() => useMiniAppAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.createAssignment({
        sessionId: 'sess-1',
        app: { id: 'app-1', title: 'App' },
        assignmentName: 'A',
        targetMode: 'students',
        targetGroupIds: ['group-1'],
        overridesBySourcedId: { 'classlink:sis-1': { timeMultiplier: 2 } },
        dueAt: 5000,
        openAt: 1000,
        closeAt: 4000,
      });
    });

    const payload = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.targetMode).toBe('students');
    // setAssignmentTargetsV1 is the sole writer of targetStudents (spec §2a).
    expect('targetStudents' in payload).toBe(false);
    expect(payload.targetGroupIds).toEqual(['group-1']);
    expect(payload.overridesBySourcedId).toEqual({
      'classlink:sis-1': { timeMultiplier: 2 },
    });
    expect(payload.dueAt).toBe(5000);
    expect(payload.openAt).toBe(1000);
    expect(payload.closeAt).toBe(4000);
  });
});

// F2 durability fix: skipped-ref count must persist onto the assignment doc
// so the "N skipped" row marker survives beyond the create-time toast.
describe('useMiniAppAssignments — setTargetSkippedCount', () => {
  it('writes targetSkippedCount as a plain number onto the assignment doc', async () => {
    const { result } = renderHook(() => useMiniAppAssignments(TEACHER_UID));

    await act(async () => {
      await result.current.setTargetSkippedCount('assign-1', 3);
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const payload = mockUpdateDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.targetSkippedCount).toBe(3);
  });
});

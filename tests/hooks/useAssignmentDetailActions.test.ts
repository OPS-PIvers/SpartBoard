import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAssignmentDetailActions } from '@/hooks/useAssignmentDetailActions';
import type { UnifiedAssignmentRow } from '@/components/assignmentsHub/useUnifiedAssignments';
import type { AssignTargetingValue } from '@/utils/studentTargetRef';

const mockSetAssignmentTargets = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useSetAssignmentTargets', () => ({
  useSetAssignmentTargets: () => ({
    setAssignmentTargets: mockSetAssignmentTargets,
  }),
}));

const mockSet = vi.hoisted(() => vi.fn());
const mockCommit = vi.hoisted(() => vi.fn());
const mockDoc = vi.hoisted(() => vi.fn((...args: unknown[]) => args.join('/')));
const mockArrayUnion = vi.hoisted(() =>
  vi.fn((...items: unknown[]) => ({ __arrayUnion: items }))
);
vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  writeBatch: () => ({ set: mockSet, commit: mockCommit }),
  arrayUnion: mockArrayUnion,
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

function makeRow(
  overrides: Partial<UnifiedAssignmentRow> = {}
): UnifiedAssignmentRow {
  return {
    id: 'assign-1',
    kind: 'quiz',
    title: 'Quiz 1',
    className: 'Period 2',
    status: 'active',
    targetMode: 'students',
    targetSkippedCount: 0,
    createdAt: 0,
    sessionId: 'assign-1',
    targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
    overridesBySourcedId: { 'classlink:SID-1': { timeMultiplier: 1.5 } },
    openAt: undefined,
    closeAt: undefined,
    ...overrides,
  };
}

describe('useAssignmentDetailActions', () => {
  beforeEach(() => {
    mockSetAssignmentTargets.mockReset().mockResolvedValue({
      written: 0,
      removed: 0,
      skipped: [],
    });
    mockSet.mockReset();
    mockCommit.mockReset().mockResolvedValue(undefined);
    mockDoc.mockClear();
  });

  it('threads the previous targeting value so a removal emits an explicit CF remove', async () => {
    const row = makeRow();
    const { result } = renderHook(() => useAssignmentDetailActions());

    const next: AssignTargetingValue = {
      targetMode: 'students',
      targetStudents: [], // removed the only targeted student
      targetGroupIds: [],
      overridesByKey: {},
    };

    await result.current.saveEdit(row, 'teacher-1', next);

    expect(mockSetAssignmentTargets).toHaveBeenCalledTimes(1);
    const call = mockSetAssignmentTargets.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(call.remove).toEqual([{ kind: 'classlink', sourcedId: 'SID-1' }]);
    expect(call.add).toEqual([]);
    // The removed student's override is cleared explicitly (null), not omitted.
    expect(
      (call.overridesBySourcedId as Record<string, unknown>)['classlink:SID-1']
    ).toBeNull();
  });

  it('records the removed ref onto removedStudentRefs via arrayUnion', async () => {
    const row = makeRow();
    const { result } = renderHook(() => useAssignmentDetailActions());

    await result.current.saveEdit(row, 'teacher-1', {
      targetMode: 'students',
      targetStudents: [],
      targetGroupIds: [],
      overridesByKey: {},
    });

    expect(mockArrayUnion).toHaveBeenCalledWith({
      kind: 'classlink',
      sourcedId: 'SID-1',
    });
    const assignmentPatch = mockSet.mock.calls[0][1] as Record<string, unknown>;
    expect(assignmentPatch.removedStudentRefs).toEqual({
      __arrayUnion: [{ kind: 'classlink', sourcedId: 'SID-1' }],
    });
  });

  it('refreshes targetSkippedCount from the CF result on save', async () => {
    mockSetAssignmentTargets.mockResolvedValue({
      written: 1,
      removed: 0,
      skipped: [
        {
          ref: { kind: 'classlink', sourcedId: 'SID-2' },
          reason: 'over-limit',
        },
      ],
    });
    const row = makeRow();
    const { result } = renderHook(() => useAssignmentDetailActions());

    const res = await result.current.saveEdit(row, 'teacher-1', {
      targetMode: 'students',
      targetStudents: [
        { kind: 'classlink', sourcedId: 'SID-1' },
        { kind: 'classlink', sourcedId: 'SID-2' },
      ],
      targetGroupIds: [],
      overridesByKey: {},
    });

    expect(res.skipped).toHaveLength(1);
    const assignmentPatch = mockSet.mock.calls[0][1] as Record<string, unknown>;
    expect(assignmentPatch.targetSkippedCount).toBe(1);
  });

  it('does not call the CF for a pure window edit on a class-wide assignment', async () => {
    const row = makeRow({
      targetMode: 'class',
      targetStudents: [],
      overridesBySourcedId: {},
    });
    const { result } = renderHook(() => useAssignmentDetailActions());

    await result.current.saveEdit(row, 'teacher-1', {
      targetMode: 'class',
      targetStudents: [],
      targetGroupIds: [],
      overridesByKey: {},
      closeAt: 12345,
    });

    expect(mockSetAssignmentTargets).not.toHaveBeenCalled();
    // Still mirrors the window onto both assignment and session docs.
    expect(mockSet).toHaveBeenCalledTimes(2);
    const assignmentPatch = mockSet.mock.calls[0][1] as Record<string, unknown>;
    const sessionPatch = mockSet.mock.calls[1][1] as Record<string, unknown>;
    expect(assignmentPatch.closeAt).toBe(12345);
    expect(sessionPatch.closeAt).toBe(12345);
  });

  it('closeNow sets closeAt to now while preserving current targeting', async () => {
    const row = makeRow();
    const { result } = renderHook(() => useAssignmentDetailActions());
    const before = Date.now();

    await result.current.closeNow(row, 'teacher-1');

    const assignmentPatch = mockSet.mock.calls[0][1] as Record<string, unknown>;
    expect(assignmentPatch.closeAt).toBeGreaterThanOrEqual(before);
    // targeting/overrides are preserved verbatim, not cleared.
    expect(assignmentPatch.overridesBySourcedId).toEqual(
      row.overridesBySourcedId
    );
  });
});

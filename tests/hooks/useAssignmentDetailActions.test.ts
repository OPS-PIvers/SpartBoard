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
const mockDeleteField = vi.hoisted(() =>
  vi.fn(() => ({ __deleteField: true }))
);
vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  writeBatch: () => ({ set: mockSet, commit: mockCommit }),
  arrayUnion: mockArrayUnion,
  deleteField: mockDeleteField,
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

  it('skipping a student preserves their stored override instead of deleting it', async () => {
    const row = makeRow();
    const { result } = renderHook(() => useAssignmentDetailActions());

    await result.current.saveEdit(row, 'teacher-1', {
      targetMode: 'students',
      targetStudents: [],
      targetGroupIds: [],
      overridesByKey: { 'classlink:SID-1': { timeMultiplier: 1.5 } },
      excludedStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
    });

    const call = mockSetAssignmentTargets.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(call.remove).toEqual([]);
    const assignmentPatch = mockSet.mock.calls[0][1] as Record<string, unknown>;
    expect(assignmentPatch['overridesBySourcedId.classlink:SID-1']).toEqual({
      timeMultiplier: 1.5,
    });
    expect(assignmentPatch.removedStudentRefs).toBeUndefined();
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

  it('calls the CF for a window edit once the assignment has pointer docs', async () => {
    const row = makeRow({
      targetMode: 'class',
      targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
      overridesBySourcedId: { 'classlink:SID-1': { timeMultiplier: 2 } },
    });
    const { result } = renderHook(() => useAssignmentDetailActions());

    await result.current.saveEdit(row, 'teacher-1', {
      targetMode: 'class',
      targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
      targetGroupIds: [],
      overridesByKey: { 'classlink:SID-1': { timeMultiplier: 2 } },
      closeAt: 999,
    });

    expect(mockSetAssignmentTargets).toHaveBeenCalledTimes(1);
    const call = mockSetAssignmentTargets.mock.calls[0][0] as {
      window: Record<string, unknown>;
    };
    expect(call.window).toEqual({ closeAt: 999 });
  });

  it('calls the CF for a window edit when only skipped students hold pointers', async () => {
    const row = makeRow({
      targetMode: 'class',
      targetStudents: [],
      overridesBySourcedId: {},
      excludedTargets: [{ kind: 'classlink', sourcedId: 'SID-2' }],
    });
    const { result } = renderHook(() => useAssignmentDetailActions());

    await result.current.saveEdit(row, 'teacher-1', {
      targetMode: 'class',
      targetStudents: [],
      targetGroupIds: [],
      overridesByKey: {},
      excludedStudents: [{ kind: 'classlink', sourcedId: 'SID-2' }],
      closeAt: 999,
    });

    expect(mockSetAssignmentTargets).toHaveBeenCalledTimes(1);
  });

  it('closeNow sets closeAt to now while preserving current targeting', async () => {
    const row = makeRow();
    const { result } = renderHook(() => useAssignmentDetailActions());
    const before = Date.now();

    await result.current.closeNow(row, 'teacher-1');

    const assignmentPatch = mockSet.mock.calls[0][1] as Record<string, unknown>;
    expect(assignmentPatch.closeAt).toBeGreaterThanOrEqual(before);
    // targeting/overrides are preserved verbatim, not cleared — written as the
    // same per-key dot-path field, not a whole-map replace.
    const expectedOverride = row.overridesBySourcedId?.['classlink:SID-1'];
    expect(assignmentPatch['overridesBySourcedId.classlink:SID-1']).toEqual(
      expectedOverride
    );
  });

  it('writes overridesBySourcedId as per-key dot-paths, deleteField-ing a cleared key', async () => {
    const row = makeRow();
    const { result } = renderHook(() => useAssignmentDetailActions());

    await result.current.saveEdit(row, 'teacher-1', {
      targetMode: 'students',
      targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
      targetGroupIds: [],
      overridesByKey: {}, // override cleared, student still targeted
    });

    const assignmentPatch = mockSet.mock.calls[0][1] as Record<string, unknown>;
    expect(assignmentPatch['overridesBySourcedId.classlink:SID-1']).toEqual({
      __deleteField: true,
    });
    // No whole-map replace field is written.
    expect(assignmentPatch.overridesBySourcedId).toBeUndefined();
  });

  it('deleteField-s a removed student key, and dot-paths an unchanged override untouched otherwise', async () => {
    const row = makeRow({
      targetStudents: [
        { kind: 'classlink', sourcedId: 'SID-1' },
        { kind: 'classlink', sourcedId: 'SID-2' },
      ],
      overridesBySourcedId: {
        'classlink:SID-1': { timeMultiplier: 1.5 },
        'classlink:SID-2': { timeMultiplier: 2 },
      },
    });
    const { result } = renderHook(() => useAssignmentDetailActions());

    await result.current.saveEdit(row, 'teacher-1', {
      targetMode: 'students',
      targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }], // SID-2 removed
      targetGroupIds: [],
      overridesByKey: { 'classlink:SID-1': { timeMultiplier: 1.5 } },
    });

    const assignmentPatch = mockSet.mock.calls[0][1] as Record<string, unknown>;
    expect(assignmentPatch['overridesBySourcedId.classlink:SID-1']).toEqual({
      timeMultiplier: 1.5,
    });
    expect(assignmentPatch['overridesBySourcedId.classlink:SID-2']).toEqual({
      __deleteField: true,
    });
  });

  it('un-skipping deletes the marker pointer without archiving a removed ref', async () => {
    const row = makeRow({
      targetMode: 'class',
      targetStudents: [],
      overridesBySourcedId: {},
      excludedTargets: [{ kind: 'classlink', sourcedId: 'SID-2' }],
    });
    const { result } = renderHook(() => useAssignmentDetailActions());

    await result.current.saveEdit(row, 'teacher-1', {
      targetMode: 'class',
      targetStudents: [],
      targetGroupIds: [],
      overridesByKey: {},
      excludedStudents: [],
    });

    const call = mockSetAssignmentTargets.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(call.remove).toEqual([{ kind: 'classlink', sourcedId: 'SID-2' }]);
    const assignmentPatch = mockSet.mock.calls[0][1] as Record<string, unknown>;
    expect(assignmentPatch.removedStudentRefs).toBeUndefined();
  });

  it('a class edit with unresolved rosters (no classContext) keeps the stored pointers', async () => {
    const row = makeRow({
      targetMode: 'class',
      targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
      overridesBySourcedId: { 'classlink:SID-1': { timeMultiplier: 1.5 } },
      excludedTargets: [{ kind: 'classlink', sourcedId: 'SID-2' }],
    });
    const { result } = renderHook(() => useAssignmentDetailActions());

    await result.current.closeNow(row, 'teacher-1');

    const call = mockSetAssignmentTargets.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(call.remove).toEqual([]);
    expect(call.excludedTargets).toEqual([
      { kind: 'classlink', sourcedId: 'SID-2' },
    ]);
    expect(call.overridesBySourcedId).toEqual({});
  });

  it('"Close now" with the class unchanged emits a window-only payload', async () => {
    const row = makeRow({
      targetMode: 'class',
      targetStudents: [{ kind: 'classlink', sourcedId: 'SID-1' }],
      overridesBySourcedId: { 'classlink:SID-1': { timeMultiplier: 1.5 } },
    });
    const { result } = renderHook(() => useAssignmentDetailActions());

    await result.current.closeNow(row, 'teacher-1', {
      rosters: [
        {
          id: 'r1',
          name: 'Period 2',
          students: [
            {
              id: 's1',
              firstName: 'Ada',
              lastName: 'Byron',
              classLinkSourcedId: 'SID-1',
            },
          ],
          // Added to the roster AFTER this assignment: must not apply now.
          defaultOverridesByStudentId: { s1: { timeMultiplier: 2 } },
        },
      ] as never,
      selectedRosterIds: ['r1'],
    });

    const call = mockSetAssignmentTargets.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(call.add).toEqual([]);
    expect(call.remove).toEqual([]);
    expect(call.overridesBySourcedId).toEqual({});
    expect(Object.keys(call.window as object)).toEqual(['closeAt']);
  });
});

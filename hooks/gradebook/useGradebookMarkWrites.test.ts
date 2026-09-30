import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_GRADEBOOK_FLAGS,
  resolveFinalScore,
  type GradebookMark,
  type GradeIndexRow,
} from '@/utils/gradebook/gradebookCore';
import type {
  GradebookCellData,
  GradebookColumnRef,
} from '@/components/gradebook/popovers/types';

const sets: { path: string; data: Record<string, unknown> }[] = [];
let autoId = 0;

vi.mock('firebase/firestore', () => ({
  doc: (parent: unknown, ...segments: string[]) => {
    if (segments.length === 0) {
      return {
        __path: `${(parent as { __path: string }).__path}/h${autoId++}`,
      };
    }
    return { __path: segments.join('/') };
  },
  collection: (ref: { __path: string }, name: string) => ({
    __path: `${ref.__path}/${name}`,
  }),
  writeBatch: () => ({
    set: (ref: { __path: string }, data: Record<string, unknown>) =>
      sets.push({ path: ref.__path, data }),
    commit: () => Promise.resolve(),
  }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 't1' } }),
}));

import {
  flagPatch,
  isFillable,
  emptyCellsBelow,
  useGradebookMarkWrites,
} from './useGradebookMarkWrites';
import { gradebookUndoStore } from './gradebookUndoStore';

const NOW = 1_700_000_000_000;
const column: GradebookColumnRef = {
  sessionId: 's1',
  kind: 'quiz',
  title: 'Quiz 1',
  dueAt: NOW - 1000,
  closeAt: null,
  config: null,
};

function row(over: Partial<GradeIndexRow> = {}): GradeIndexRow {
  return {
    kind: 'quiz',
    sessionId: 's1',
    studentUid: 'u1',
    ownerUid: 't1',
    editorUids: [],
    rosterIds: ['r1'],
    classIds: [],
    title: 'Quiz 1',
    rawPct: null,
    points: null,
    max: 10,
    state: 'not-attempted',
    submittedAt: null,
    dueAt: NOW - 1000,
    openAt: null,
    closeAt: null,
    createdAt: NOW - 10_000,
    attempts: [],
    targetEvidence: [],
    published: false,
    assigned: true,
    updatedAt: NOW,
    ...over,
  };
}

function cell(
  uid: string,
  r: GradeIndexRow | null,
  mark: GradebookMark | null = null
): GradebookCellData {
  return {
    student: { uid, name: uid, firstName: uid },
    row: r,
    mark,
    final: resolveFinalScore(r, mark, null, {
      flagDefs: DEFAULT_GRADEBOOK_FLAGS,
      autoFlags: true,
      now: NOW,
    }),
  };
}

function mark(over: Partial<GradebookMark> = {}): GradebookMark {
  return {
    kind: 'quiz',
    sessionId: 's1',
    studentUid: 'u1',
    ownerUid: 't1',
    editorUids: [],
    rosterIds: ['r1'],
    override: null,
    comment: null,
    flags: [],
    suppressedAuto: [],
    publishOverride: null,
    updatedAt: 1,
    ...over,
  };
}

beforeEach(() => {
  sets.length = 0;
  gradebookUndoStore.clear();
});

describe('empty cells', () => {
  it('counts empty and auto-Missing cells, never submitted, overridden, flagged or unassigned ones', () => {
    expect(isFillable(cell('a', row()))).toBe(true);
    expect(
      isFillable(
        cell('b', row({ submittedAt: NOW - 5, state: 'scored', points: 5 }))
      )
    ).toBe(false);
    expect(
      isFillable(cell('c', row(), mark({ override: { points: 3, at: 1 } })))
    ).toBe(false);
    expect(isFillable(cell('d', row(), mark({ flags: ['excused'] })))).toBe(
      false
    );
    expect(isFillable(cell('g', row(), mark({ flags: ['absent'] })))).toBe(
      false
    );
    expect(isFillable(cell('e', row({ assigned: false })))).toBe(false);
  });

  it('fill down only looks below the student in row order', () => {
    const cells = ['u1', 'u2', 'u3'].map((u) =>
      cell(u, row({ studentUid: u }))
    );
    expect(emptyCellsBelow(cells, 'u2').map((c) => c.student.uid)).toEqual([
      'u3',
    ]);
  });
});

describe('flagPatch', () => {
  it('suppresses an auto flag instead of adding a manual one', () => {
    expect(
      flagPatch(mark(), 'missing', [{ id: 'missing', auto: true }])
    ).toEqual({
      suppressedAuto: ['missing'],
    });
  });

  it('adds a manual flag and lifts its suppression, then removes it', () => {
    const m = mark({ suppressedAuto: ['late'] });
    expect(flagPatch(m, 'late', [])).toEqual({
      flags: ['late'],
      suppressedAuto: [],
    });
    expect(
      flagPatch(mark({ flags: ['late'] }), 'late', [
        { id: 'late', auto: false },
      ])
    ).toEqual({ flags: [] });
  });
});

describe('useGradebookMarkWrites', () => {
  it('creates the mark with history in one batch', async () => {
    const { result } = renderHook(() => useGradebookMarkWrites('r1'));
    await act(() => result.current.setOverride(column, cell('u1', row()), 7));
    const markWrite = sets.find((s) => s.path === 'gradebook_marks/s1__u1');
    expect(markWrite?.data).toMatchObject({
      ownerUid: 't1',
      editorUids: [],
      rosterIds: ['r1'],
      override: { points: 7 },
      flags: [],
    });
    const hist = sets.find((s) =>
      s.path.startsWith('gradebook_marks/s1__u1/history/')
    );
    expect(hist?.data).toMatchObject({
      ownerUid: 't1',
      byUid: 't1',
      field: 'override',
      before: null,
      after: 7,
    });
  });

  it('fills down as one batch and one undo restores every cell', async () => {
    const { result } = renderHook(() => useGradebookMarkWrites('r1'));
    const own = cell('u0', row({ studentUid: 'u0' }));
    const below = [
      cell('u1', row({ studentUid: 'u1' })),
      cell(
        'u2',
        row({
          studentUid: 'u2',
          submittedAt: NOW - 5,
          state: 'scored',
          points: 8,
        })
      ),
      cell(
        'u3',
        row({ studentUid: 'u3' }),
        mark({
          studentUid: 'u3',
          comment: { text: 'hi', shared: false, at: 1 },
        })
      ),
    ];
    let res: { batchId: string; count: number } | undefined;
    await act(async () => {
      res = await result.current.fillDown(column, own, below, 5);
    });
    expect(res?.count).toBe(2);
    const hist = sets.filter((s) => s.path.includes('/history/'));
    expect(hist).toHaveLength(3);
    expect(new Set(hist.map((h) => h.data.batchId))).toEqual(
      new Set([res?.batchId])
    );

    sets.length = 0;
    await act(async () => {
      await result.current.undoBatch(res?.batchId);
    });
    const restored = sets.filter((s) => !s.path.includes('/history/'));
    expect(restored.map((s) => s.path).sort()).toEqual([
      'gradebook_marks/s1__u0',
      'gradebook_marks/s1__u1',
      'gradebook_marks/s1__u3',
    ]);
    expect(restored.every((s) => s.data.override === null)).toBe(true);
    expect(
      (
        restored.find((s) => s.path.endsWith('u3'))?.data.comment as {
          text: string;
        }
      ).text
    ).toBe('hi');
    expect(gradebookUndoStore.peek()).toBeNull();
  });

  it('Mark all sets a flag on empty cells only', async () => {
    const { result } = renderHook(() => useGradebookMarkWrites('r1'));
    const cells = [
      cell('u1', row({ studentUid: 'u1' })),
      cell('u2', row({ studentUid: 'u2', submittedAt: NOW - 5 })),
    ];
    await act(async () => {
      await result.current.markAll(column, cells, 'missing');
    });
    const marks = sets.filter((s) => !s.path.includes('/history/'));
    expect(marks.map((m) => m.path)).toEqual(['gradebook_marks/s1__u1']);
    expect(marks[0].data.flags).toEqual(['missing']);
  });
});

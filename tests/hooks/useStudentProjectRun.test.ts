// A student reads only their own group, by membership, whatever the run doc says.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { useStudentProjectRun } from '@/hooks/useStudentProjectRun';

interface Target {
  path?: string[];
  ref?: { path: string[] };
  constraints?: { field: string; op: string; value: unknown }[];
}
type Listener = (snapshot: unknown) => void;

const listeners: { target: Target; next: Listener }[] = [];

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  onSnapshot: vi.fn((target: Target, next: Listener) => {
    const entry = { target, next };
    listeners.push(entry);
    return () => {
      const index = listeners.indexOf(entry);
      if (index >= 0) listeners.splice(index, 1);
    };
  }),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({
    ref,
    constraints,
  })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    field,
    op,
    value,
  })),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

const RUN_ID = 'teacher-1_proj-1';
const GROUPS = ['project_runs', RUN_ID, 'groups'];

const groupQueries = () =>
  listeners
    .map((l) => l.target)
    .filter((t) => t.ref?.path.join('/') === GROUPS.join('/'))
    .map((t) => t.constraints);

const listenerFor = (predicate: (t: Target) => boolean) =>
  listeners.find((l) => predicate(l.target));

const emitRun = (data: Record<string, unknown>) => {
  const run = listenerFor(
    (t) => t.path?.join('/') === `project_runs/${RUN_ID}`
  );
  act(() => run?.next({ exists: () => true, id: RUN_ID, data: () => data }));
};

const groupDoc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

describe('useStudentProjectRun groups listeners', () => {
  beforeEach(() => {
    listeners.length = 0;
    vi.clearAllMocks();
  });

  it('reads the caller’s own group by membership, never an unfiltered listing', () => {
    renderHook(() => useStudentProjectRun(RUN_ID, 'student-1'));
    expect(groupQueries()).toEqual([
      [{ field: 'memberUids', op: 'array-contains', value: 'student-1' }],
    ]);
    expect(onSnapshot).not.toHaveBeenCalledWith(
      { path: GROUPS },
      expect.anything(),
      expect.anything()
    );
  });

  it('never asks for classmates, even on a run that once showed them', () => {
    renderHook(() => useStudentProjectRun(RUN_ID, 'student-1'));
    emitRun({ showStatusToStudents: true });
    expect(groupQueries()).toEqual([
      [{ field: 'memberUids', op: 'array-contains', value: 'student-1' }],
    ]);
  });

  it('reads work links from private/work once the own group is known', () => {
    renderHook(() => useStudentProjectRun(RUN_ID, 'student-1'));
    const own = listenerFor((t) => t.constraints?.[0]?.field === 'memberUids');
    act(() =>
      own?.next({
        docs: [groupDoc('g1', { name: 'Mine', memberUids: ['student-1'] })],
      })
    );
    expect(
      listeners.some(
        (l) =>
          l.target.path?.join('/') ===
          `project_runs/${RUN_ID}/groups/g1/private/work`
      )
    ).toBe(true);
  });

  it('falls back to the legacy group-doc links until private/work exists', () => {
    const { result } = renderHook(() =>
      useStudentProjectRun(RUN_ID, 'student-1')
    );
    const own = listenerFor((t) => t.constraints?.[0]?.field === 'memberUids');
    const legacy = {
      id: 'l1',
      url: 'https://old',
      addedByUid: 'x',
      addedAt: 1,
    };
    act(() =>
      own?.next({
        docs: [
          groupDoc('g1', {
            name: 'Mine',
            memberUids: ['student-1'],
            workLinks: [legacy],
          }),
        ],
      })
    );
    const work = listenerFor(
      (t) =>
        t.path?.join('/') === `project_runs/${RUN_ID}/groups/g1/private/work`
    );
    act(() => work?.next({ exists: () => false, data: () => undefined }));
    expect(result.current.workLinks).toEqual([legacy]);

    const fresh = { ...legacy, id: 'l2', url: 'https://new' };
    act(() =>
      work?.next({ exists: () => true, data: () => ({ workLinks: [fresh] }) })
    );
    expect(result.current.workLinks).toEqual([fresh]);
  });
});

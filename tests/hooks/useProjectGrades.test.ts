// Per-member overrides live in their own docs, never on the grade every member reads.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useProjectGrades } from '@/hooks/useProjectGrades';

type Listener = (snapshot: unknown) => void;
const listeners = new Map<string, Listener>();
const ops: { op: string; path: string; data?: unknown }[] = [];

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  doc: vi.fn((base: { path?: string[] }, ...path: string[]) => ({
    path: [...(base?.path ?? []), ...path],
  })),
  deleteField: vi.fn(() => '__delete__'),
  onSnapshot: vi.fn((target: { path: string[] }, next: Listener) => {
    listeners.set(target.path.join('/'), next);
    return () => listeners.delete(target.path.join('/'));
  }),
  writeBatch: vi.fn(() => ({
    set: (ref: { path: string[] }, data: unknown) =>
      ops.push({ op: 'set', path: ref.path.join('/'), data }),
    update: (ref: { path: string[] }, data: unknown) =>
      ops.push({ op: 'update', path: ref.path.join('/'), data }),
    delete: (ref: { path: string[] }) =>
      ops.push({ op: 'delete', path: ref.path.join('/') }),
    commit: () => Promise.resolve(),
  })),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

const RUN = 'teacher-1_proj-1';
const GRADES = `project_runs/${RUN}/grades`;
const docs = (entries: [string, Record<string, unknown>][]) => ({
  docs: entries.map(([id, data]) => ({ id, data: () => data })),
});
const base = {
  groupId: 'g1',
  rubricScores: [],
  points: 10,
  maxPoints: 20,
  released: true,
  gradedAt: 1,
};

describe('useProjectGrades', () => {
  beforeEach(() => {
    listeners.clear();
    ops.length = 0;
  });

  it('saves overrides as per-member docs and keeps them off the shared grade', async () => {
    const { result } = renderHook(() => useProjectGrades(RUN));
    act(() => listeners.get(GRADES)?.(docs([['g1', base]])));
    act(() =>
      listeners.get(`${GRADES}/g1/overrides`)?.(docs([['old', { points: 1 }]]))
    );
    expect(result.current.gradesByGroupId.g1.overridesByUid).toEqual({
      old: { points: 1 },
    });
    await act(() =>
      result.current.saveGrade({
        ...base,
        overridesByUid: { u1: { points: 5, note: 'n' } },
      })
    );
    const shared = ops.find((o) => o.path === `${GRADES}/g1`);
    expect(shared?.data).not.toHaveProperty('overridesByUid');
    expect(ops).toContainEqual({
      op: 'set',
      path: `${GRADES}/g1/overrides/u1`,
      data: { points: 5, note: 'n' },
    });
    expect(ops).toContainEqual({
      op: 'delete',
      path: `${GRADES}/g1/overrides/old`,
    });
  });

  it('moves a legacy override map into per-member docs', () => {
    renderHook(() => useProjectGrades(RUN));
    act(() =>
      listeners.get(GRADES)?.(
        docs([['g1', { ...base, overridesByUid: { u1: { points: 3 } } }]])
      )
    );
    expect(ops).toEqual([
      { op: 'set', path: `${GRADES}/g1/overrides/u1`, data: { points: 3 } },
      {
        op: 'update',
        path: `${GRADES}/g1`,
        data: { overridesByUid: '__delete__' },
      },
    ]);
  });
});

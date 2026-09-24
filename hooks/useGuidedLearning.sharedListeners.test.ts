import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningAssignment } from '@/types';

interface Q {
  path: string;
  constraints: Record<string, unknown>[];
}
interface Listener {
  target: Q;
  next: (snap: unknown) => void;
  active: boolean;
}

const fs = vi.hoisted(() => ({ listeners: [] as Listener[] }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  query: (path: string, ...constraints: Record<string, unknown>[]) => ({
    path,
    constraints,
  }),
  orderBy: (field: string, dir?: string) => ({ orderBy: [field, dir] }),
  where: (field: string, op: string, value: unknown) => ({
    where: [field, op, value],
  }),
  limit: (n: number) => ({ limit: n }),
  onSnapshot: (target: Q | string, next: (snap: unknown) => void) => {
    const listener: Listener = {
      target:
        typeof target === 'string' ? { path: target, constraints: [] } : target,
      next,
      active: true,
    };
    fs.listeners.push(listener);
    return () => {
      listener.active = false;
    };
  },
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: () => null,
  runTransaction: vi.fn(),
  writeBatch: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ googleAccessToken: null, isAdmin: false }),
}));
vi.mock('./useGoogleDrive', () => ({
  useGoogleDrive: () => ({ isConnected: false }),
}));

import { useGuidedLearning } from './useGuidedLearning';
import {
  GL_ASSIGNMENTS_PAGE_SIZE,
  useGuidedLearningAssignments,
} from './useGuidedLearningAssignments';
import { useFolders } from './useFolders';

const ASSIGNMENTS = 'users/t1/guided_learning_assignments';

const active = () => fs.listeners.filter((l) => l.active);
const countByPath = () => {
  const counts: Record<string, number> = {};
  for (const l of active())
    counts[l.target.path] = (counts[l.target.path] ?? 0) + 1;
  return counts;
};
const openListener = () =>
  active().find(
    (l) =>
      l.target.path === ASSIGNMENTS &&
      l.target.constraints.some((c) => 'where' in c)
  );
const recentListener = () =>
  active().find(
    (l) =>
      l.target.path === ASSIGNMENTS &&
      l.target.constraints.some((c) => 'limit' in c)
  );
const snapOf = (docs: GuidedLearningAssignment[]) => ({
  docs: docs.map((a) => ({ id: a.id, data: () => a })),
});
const assignment = (
  n: number,
  status: GuidedLearningAssignment['status']
): GuidedLearningAssignment => ({
  id: `a-${n}`,
  sessionId: `a-${n}`,
  setId: 's',
  setTitle: `Set ${n}`,
  teacherUid: 't1',
  status,
  createdAt: n,
  updatedAt: n,
  archivedAt: status === 'archived' ? n : null,
});

// Board-level GL widget: every subscription the widget and its manager open.
const useGlWidget = () => ({
  gl: useGuidedLearning('t1'),
  assignments: useGuidedLearningAssignments('t1'),
  folders: useFolders('t1', 'guided_learning'),
});

beforeEach(() => {
  fs.listeners = [];
});

describe('GL listeners shared across widgets', () => {
  it('two GL widgets on one board open one listener per query', () => {
    const a = renderHook(useGlWidget);
    const b = renderHook(useGlWidget);
    act(() =>
      active()
        .find((l) => l.target.path === 'building_guided_learning_index/_meta')
        ?.next({ exists: () => true })
    );

    expect(countByPath()).toEqual({
      'users/t1/guided_learning': 1,
      'building_guided_learning_index/_meta': 1,
      building_guided_learning_index: 1,
      // Open and recent: two queries, each shared.
      [ASSIGNMENTS]: 2,
      'users/t1/guided_learning_folders': 1,
    });

    act(() =>
      active()
        .find((l) => l.target.path === 'users/t1/guided_learning')
        ?.next({ docs: [{ data: () => ({ id: 'p1', title: 'Mine' }) }] })
    );
    expect(a.result.current.gl.sets).toEqual([{ id: 'p1', title: 'Mine' }]);
    expect(b.result.current.gl.sets).toEqual([{ id: 'p1', title: 'Mine' }]);

    a.unmount();
    expect(active()).toHaveLength(6);
    b.unmount();
    expect(active()).toHaveLength(0);
  });

  it('keeps the full-collection fallback until the index marker exists', () => {
    renderHook(useGlWidget);
    renderHook(useGlWidget);
    act(() =>
      active()
        .find((l) => l.target.path === 'building_guided_learning_index/_meta')
        ?.next({ exists: () => false })
    );
    expect(countByPath().building_guided_learning).toBe(1);
    expect(countByPath().building_guided_learning_index).toBeUndefined();
  });
});

describe('GL assignments listener limit', () => {
  it('caps the recent query at 50 but never drops an open assignment', () => {
    const { result } = renderHook(() => useGuidedLearningAssignments('t1'));
    expect(openListener()?.target.constraints).toEqual([
      { where: ['status', '==', 'active'] },
    ]);
    expect(recentListener()?.target.constraints).toContainEqual({
      limit: GL_ASSIGNMENTS_PAGE_SIZE,
    });

    const recent = Array.from({ length: 50 }, (_, i) =>
      assignment(1000 - i, 'archived')
    );
    const oldOpen = assignment(1, 'active');
    act(() => {
      recentListener()?.next(snapOf(recent));
      openListener()?.next(snapOf([oldOpen]));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.assignments).toHaveLength(51);
    expect(result.current.assignments.at(-1)).toEqual(oldOpen);
    expect(result.current.hasOlder).toBe(true);
  });

  it('"Show older" widens the recent query by a page', () => {
    const { result } = renderHook(() => useGuidedLearningAssignments('t1'));
    const firstPage = Array.from({ length: 50 }, (_, i) =>
      assignment(1000 - i, 'archived')
    );
    act(() => {
      openListener()?.next(snapOf([]));
      recentListener()?.next(snapOf(firstPage));
    });
    const firstRecent = recentListener();

    act(() => result.current.showOlder());
    expect(firstRecent?.active).toBe(false);
    expect(recentListener()?.target.constraints).toContainEqual({ limit: 100 });
    // Keeps the loaded page until the wider snapshot lands.
    expect(result.current.assignments).toHaveLength(50);

    const more = [...firstPage, assignment(10, 'archived')];
    act(() => recentListener()?.next(snapOf(more)));
    expect(result.current.assignments).toHaveLength(51);
    expect(result.current.hasOlder).toBe(false);
  });

  it('keeps the fresher copy when both queries hold a doc', () => {
    const { result } = renderHook(() => useGuidedLearningAssignments('t1'));
    const stale = assignment(5, 'active');
    const archived = { ...stale, status: 'archived' as const, updatedAt: 9 };
    act(() => {
      openListener()?.next(snapOf([stale]));
      recentListener()?.next(snapOf([archived]));
    });
    expect(result.current.assignments).toEqual([archived]);
  });
});

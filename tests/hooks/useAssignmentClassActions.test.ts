import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PeriodAccess } from '@/types';
import {
  useAssignmentClassActions,
  type AssignmentLifecycle,
  type AssignmentRun,
} from '@/hooks/useAssignmentClassActions';

const store = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  writes: [] as Array<[string, Record<string, unknown>]>,
  periodArgs: [] as unknown[],
}));

const periods = vi.hoisted(() => ({
  startPeriod: vi.fn(() => Promise.resolve([])),
  reopenPeriod: vi.fn(() => Promise.resolve([])),
  pausePeriod: vi.fn(() => Promise.resolve()),
  closePeriod: vi.fn(() => Promise.resolve()),
  closeAllPeriods: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/hooks/usePeriodAccess', () => ({
  usePeriodAccess: (...args: unknown[]) => {
    store.periodArgs = args;
    return periods;
  },
  closedRow: (now: number) => ({
    state: 'closed',
    closedAt: now,
    pausedAt: now,
  }),
}));
vi.mock('firebase/firestore', () => {
  class FieldPath {
    segments: string[];
    constructor(...segments: string[]) {
      this.segments = segments;
    }
  }
  const apply = (path: string, fields: Record<string, unknown>) => {
    store.writes.push([path, fields]);
    if (!store.doc || !path.startsWith('users/')) return;
    for (const [k, v] of Object.entries(fields)) {
      const segs = k.split('.');
      if (segs[0] === 'periodAccess') {
        const pa = store.doc.periodAccess as Record<
          string,
          Record<string, unknown>
        >;
        pa[segs[1]] = { ...pa[segs[1]], [segs[2]]: v };
      } else store.doc[k] = v;
    }
  };
  return {
    FieldPath,
    doc: (_db: unknown, ...segs: string[]) => segs.join('/'),
    getDoc: vi.fn(() =>
      Promise.resolve({
        data: () => (store.doc ? structuredClone(store.doc) : undefined),
      })
    ),
    updateDoc: vi.fn((path: string, fields: Record<string, unknown>) => {
      apply(path, fields);
      return Promise.resolve();
    }),
    writeBatch: () => {
      const ops: Array<[string, Record<string, unknown>]> = [];
      return {
        update: (p: string, f: Record<string, unknown>) => ops.push([p, f]),
        commit: () => {
          for (const [p, f] of ops) apply(p, f);
          return Promise.resolve();
        },
      };
    },
    runTransaction: async (
      _db: unknown,
      fn: (tx: {
        get: (p: string) => Promise<{ data: () => unknown }>;
        update: (p: string, ...args: unknown[]) => void;
      }) => Promise<unknown>
    ) => {
      const ops: Array<[string, Record<string, unknown>]> = [];
      const result = await fn({
        get: () =>
          Promise.resolve({
            data: () => (store.doc ? structuredClone(store.doc) : undefined),
          }),
        update: (p, ...args) => {
          const out: Record<string, unknown> = {};
          for (let i = 0; i < args.length; i += 2)
            out[(args[i] as FieldPath).segments.join('.')] = args[i + 1];
          ops.push([p, out]);
        },
      });
      for (const [p, f] of ops) apply(p, f);
      return result;
    },
  };
});
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 't1' } }),
}));

const row = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'open',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P',
  ...over,
});

const COLLECTIONS = {
  sessionCollection: 'mini_app_sessions',
  assignmentCollection: 'miniapp_assignments',
  refreshIdle: false,
};

const lifecycleOf = (over: Partial<AssignmentLifecycle> = {}) => ({
  end: vi.fn((): Promise<void> => {
    if (store.doc) store.doc.status = 'archived';
    return Promise.resolve();
  }),
  reopen: vi.fn((): Promise<void> => {
    if (store.doc) store.doc.status = 'active';
    return Promise.resolve();
  }),
  turnInClass: vi.fn(() => Promise.resolve()),
  turnInDelayMs: 1000,
  ...over,
});

const setup = (run: AssignmentRun, lifecycle: AssignmentLifecycle) => {
  store.doc = structuredClone(run) as unknown as Record<string, unknown>;
  return renderHook(() =>
    useAssignmentClassActions(run, COLLECTIONS, lifecycle, [])
  ).result;
};

const run = (over: Partial<AssignmentRun> = {}): AssignmentRun => ({
  id: 'a1',
  sessionId: 's9',
  teacherUid: 't1',
  status: 'active',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  store.writes = [];
});
afterEach(() => vi.useRealTimers());

describe('useAssignmentClassActions', () => {
  it('writes the session by its own id and the assignment by the assignment id', async () => {
    const x = setup(
      run({ periodAccess: { c1: row(), c2: row() } }),
      lifecycleOf()
    );
    await act(() => x.current.closeClass('c1'));
    expect(store.writes.map(([p]) => p)).toEqual([
      'mini_app_sessions/s9',
      'users/t1/miniapp_assignments/a1',
    ]);
    expect(store.periodArgs[0]).toMatchObject({ id: 's9' });
    expect(store.periodArgs[1]).toMatchObject({
      sessionCollection: 'mini_app_sessions',
      assignmentId: 'a1',
      refreshIdle: false,
    });
  });

  it('turns the last class in after End when End does not turn work in', async () => {
    vi.useFakeTimers();
    const lifecycle = lifecycleOf();
    const x = setup(
      run({
        periodAccess: { c1: row(), c2: row({ state: 'closed', closedAt: 5 }) },
      }),
      lifecycle
    );
    await act(() => x.current.closeClass('c1'));
    expect(lifecycle.end).toHaveBeenCalledWith('a1');
    vi.advanceTimersByTime(1000);
    expect(lifecycle.turnInClass).toHaveBeenCalledWith(
      's9',
      'c1',
      expect.any(Number)
    );
  });

  it('leaves the last class to End when End turns work in', async () => {
    vi.useFakeTimers();
    const lifecycle = lifecycleOf({ endTurnsIn: true });
    const x = setup(run({ periodAccess: { c1: row() } }), lifecycle);
    await act(() => x.current.closeClass('c1'));
    vi.advanceTimersByTime(1000);
    expect(lifecycle.end).toHaveBeenCalledTimes(1);
    expect(lifecycle.turnInClass).not.toHaveBeenCalled();
  });

  it("reads the kind's own ended spelling and does not end twice", async () => {
    const lifecycle = lifecycleOf();
    const x = setup(
      run({
        status: 'archived',
        periodAccess: { c1: row({ state: 'closed', closedAt: 5 }) },
      }),
      lifecycle
    );
    await act(() => x.current.closeAll());
    expect(lifecycle.end).not.toHaveBeenCalled();
  });

  it('takes a custom isEnded', async () => {
    const lifecycle = lifecycleOf({ isEnded: () => true });
    const x = setup(run({ periodAccess: { c1: row() } }), lifecycle);
    await act(() => x.current.closeAll());
    expect(lifecycle.end).not.toHaveBeenCalled();
  });

  it('opening a class of an ended run reopens it without a resume', async () => {
    const lifecycle = lifecycleOf();
    const x = setup(
      run({
        status: 'archived',
        periodAccess: { c1: row({ state: 'closed', closedAt: 5 }) },
      }),
      lifecycle
    );
    await act(() => x.current.reopenClass('c1'));
    expect(periods.reopenPeriod).toHaveBeenCalledWith('c1');
    expect(lifecycle.reopen).toHaveBeenCalledWith('a1');
  });

  it('a single-line pause throws when the kind has no whole-run pause', async () => {
    const x = setup(run(), lifecycleOf());
    await expect(x.current.pauseClass(null)).rejects.toThrow(
      'This assignment cannot be paused.'
    );
  });

  it('a single-line Close marks closedAt and ends the run', async () => {
    const lifecycle = lifecycleOf();
    const x = setup(run(), lifecycle);
    await act(() => x.current.closeClass(null));
    expect(store.doc?.closedAt).toEqual(expect.any(Number));
    expect(lifecycle.end).toHaveBeenCalledWith('a1');
  });

  it('clears Done and close marks when it reopens an ended run', async () => {
    const x = setup(
      run({
        status: 'inactive',
        doneAt: 7,
        periodAccess: { c1: row({ state: 'closed', closedAt: 5 }) },
      }),
      lifecycleOf()
    );
    await act(() => x.current.reopenClass('c1'));
    expect(store.doc).toMatchObject({ doneAt: null, closedAt: null });
  });

  it('Close for all classes turns in each closed class when End does not', async () => {
    vi.useFakeTimers();
    const lifecycle = lifecycleOf();
    periods.closeAllPeriods.mockImplementationOnce(() => {
      const pa = store.doc?.periodAccess as Record<
        string,
        Record<string, unknown>
      >;
      for (const k of Object.keys(pa))
        pa[k] = { ...pa[k], state: 'closed', closedAt: 9 };
      return Promise.resolve();
    });
    const x = setup(run({ periodAccess: { c1: row(), c2: row() } }), lifecycle);
    await act(() => x.current.closeAll());
    vi.advanceTimersByTime(1000);
    expect(lifecycle.end).toHaveBeenCalledTimes(1);
    expect(lifecycle.turnInClass).toHaveBeenCalledWith('s9', 'c1', 9);
    expect(lifecycle.turnInClass).toHaveBeenCalledWith('s9', 'c2', 9);
  });

  it('Move to Done leaves the turn-in to End when End turns work in', async () => {
    vi.useFakeTimers();
    const lifecycle = lifecycleOf({ endTurnsIn: true });
    const x = setup(
      run({ periodAccess: { c1: row({ state: 'closed', closedAt: 9 }) } }),
      lifecycle
    );
    await act(() => x.current.moveToDone());
    vi.advanceTimersByTime(1000);
    expect(lifecycle.turnInClass).not.toHaveBeenCalled();
  });

  it('hands a cleared single-line window to the kind so student pointers follow', async () => {
    const onWindowCleared = vi.fn(() => Promise.resolve());
    const x = setup(
      run({ status: 'inactive', closedAt: 5, closeAt: 10 }),
      lifecycleOf({ onWindowCleared })
    );
    await act(() => x.current.reopenClass(null));
    expect(onWindowCleared).toHaveBeenCalledWith('a1', { closeAt: null });
  });
});

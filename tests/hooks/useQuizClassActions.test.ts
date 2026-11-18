import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PeriodAccess, QuizAssignment } from '@/types';
import { useQuizClassActions } from '@/hooks/useQuizClassActions';
import {
  END_TURN_IN_DELAY_MS,
  finalizeClassQuizResponses,
} from '@/utils/quizFinalizeOpenResponses';

const ASSIGNMENT = 'users/t1/quiz_assignments/a1';
const SESSION = 'quiz_sessions/a1';

// The stored assignment doc; every write bumps its version so a transaction that read an older one retries.
const store = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  version: 0,
  calls: [] as string[],
  writes: [] as Array<[string, Record<string, unknown>]>,
}));

const rows = () =>
  (store.doc?.periodAccess ?? {}) as Record<string, Record<string, unknown>>;
const setRow = (key: string, patch: Record<string, unknown>) => {
  rows()[key] = { ...rows()[key], ...patch };
  store.version += 1;
};
const setStatus = (status: string) => {
  if (store.doc) store.doc.status = status;
  store.version += 1;
};
const tick = () => new Promise<void>((r) => queueMicrotask(r));

const periods = vi.hoisted(() => ({
  startPeriod: vi.fn(),
  reopenPeriod: vi.fn(),
  pausePeriod: vi.fn(),
  closePeriod: vi.fn(),
  closeAllPeriods: vi.fn(),
}));
vi.mock('@/hooks/usePeriodAccess', () => ({
  usePeriodAccess: () => periods,
  closedRow: (now: number) => ({
    state: 'closed',
    closedAt: now,
    pausedAt: now,
  }),
}));
vi.mock('@/utils/quizFinalizeOpenResponses', () => ({
  END_TURN_IN_DELAY_MS: 125_000,
  finalizeClassQuizResponses: vi.fn(() => Promise.resolve()),
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
    if (path !== ASSIGNMENT || !store.doc) return;
    for (const [k, v] of Object.entries(fields)) {
      const segs = k.split('.');
      if (segs[0] === 'periodAccess') setRow(segs[1], { [segs[2]]: v });
      else store.doc[k] = v;
    }
    store.version += 1;
  };
  const flatten = (args: unknown[]) => {
    const out: Record<string, unknown> = {};
    for (let i = 0; i < args.length; i += 2)
      out[(args[i] as FieldPath).segments.join('.')] = args[i + 1];
    return out;
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
      store.calls.push(`mark:${JSON.stringify(fields)}`);
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
      for (;;) {
        let seen = -1;
        const ops: Array<[string, Record<string, unknown>]> = [];
        const result = await fn({
          get: async () => {
            seen = store.version;
            const snapshot = store.doc ? structuredClone(store.doc) : undefined;
            await tick();
            return { data: () => snapshot };
          },
          update: (p, ...args) => ops.push([p, flatten(args)]),
        });
        if (seen !== store.version) continue;
        for (const [p, f] of ops) apply(p, f);
        return result;
      }
    },
  };
});
vi.mock('@/config/firebase', () => ({ db: {} }));
const authUid = vi.hoisted(() => ({ uid: 't1' }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: authUid.uid } }),
}));

const lifecycle = {
  pauseAssignment: vi.fn((id: string) => {
    store.calls.push(`status:pause:${id}`);
    setStatus('paused');
    return Promise.resolve();
  }),
  resumeAssignment: vi.fn((id: string) => {
    store.calls.push(`status:resume:${id}`);
    setStatus('active');
    return Promise.resolve();
  }),
  deactivateAssignment: vi.fn((id: string) => {
    store.calls.push(`status:end:${id}`);
    setStatus('inactive');
    return Promise.resolve();
  }),
  reopenAssignment: vi.fn((id: string) => {
    store.calls.push(`status:reopen:${id}`);
    setStatus('paused');
    return Promise.resolve();
  }),
};

const row = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P',
  ...over,
});
const assignment = (over: Partial<QuizAssignment>): QuizAssignment =>
  ({
    id: 'a1',
    teacherUid: 't1',
    status: 'active',
    ...over,
  }) as QuizAssignment;

/** Seeds the stored doc and renders the hook with the same (or a staler) snapshot. */
const setup = (stored: QuizAssignment, rendered: QuizAssignment = stored) => {
  store.doc = structuredClone(stored) as unknown as Record<string, unknown>;
  const { result } = renderHook(() =>
    useQuizClassActions(rendered, lifecycle, [])
  );
  return result;
};

beforeEach(() => {
  vi.clearAllMocks();
  store.calls = [];
  store.writes = [];
  store.version = 0;
  authUid.uid = 't1';
  periods.startPeriod.mockImplementation((k: string) => {
    store.calls.push(`start:${k}`);
    setRow(k, { state: 'open' });
    return Promise.resolve([]);
  });
  periods.reopenPeriod.mockImplementation((k: string) => {
    store.calls.push(`reopen:${k}`);
    setRow(k, { state: 'open', closedAt: null });
    return Promise.resolve([]);
  });
  periods.pausePeriod.mockImplementation((k: string) => {
    store.calls.push(`pause:${k}`);
    setRow(k, { state: 'paused' });
    return Promise.resolve();
  });
  periods.closePeriod.mockImplementation((k: string, at = Date.now()) => {
    store.calls.push(`close:${k}`);
    setRow(k, { state: 'closed', closedAt: at, pausedAt: at });
    return Promise.resolve();
  });
  periods.closeAllPeriods.mockImplementation(() => {
    store.calls.push('closeAll');
    return Promise.resolve();
  });
});
afterEach(() => vi.useRealTimers());

describe('useQuizClassActions (D21)', () => {
  it('leaves an active status alone when another class opens', async () => {
    const x = setup(
      assignment({ periodAccess: { c1: row({ state: 'open' }), c2: row() } })
    );
    await act(() => x.current.openClass('c2'));
    expect(store.calls).toEqual(['start:c2']);
  });

  it('closing one class while another is Ready keeps the run going', async () => {
    const x = setup(
      assignment({ periodAccess: { c1: row({ state: 'open' }), c2: row() } })
    );
    await act(() => x.current.closeClass('c1'));
    expect(store.calls).toEqual([]);
    expect(rows().c1).toMatchObject({ state: 'closed' });
    expect(store.writes.map(([p]) => p)).toEqual([SESSION, ASSIGNMENT]);
  });

  it('closing the last class not closed ends the run', async () => {
    const x = setup(
      assignment({
        periodAccess: {
          c1: row({ state: 'open' }),
          c2: row({ closedAt: 5 }),
          c3: row({ state: 'open', closeAt: 1 }),
        },
      })
    );
    await act(() => x.current.closeClass('c1'));
    expect(store.calls).toEqual(['status:end:a1']);
  });

  it('two quick closes of different classes end the run once', async () => {
    const x = setup(
      assignment({
        periodAccess: {
          c1: row({ state: 'open' }),
          c2: row({ state: 'open' }),
          c3: row({ closedAt: 5 }),
        },
      })
    );
    await act(() =>
      Promise.all([x.current.closeClass('c1'), x.current.closeClass('c2')])
    );
    expect(lifecycle.deactivateAssignment).toHaveBeenCalledTimes(1);
  });

  it('does not end the run when another tab just reopened a class', async () => {
    const stale = assignment({
      periodAccess: { c1: row({ state: 'open' }), c2: row({ closedAt: 5 }) },
    });
    const stored = assignment({
      periodAccess: { c1: row({ state: 'open' }), c2: row({ state: 'open' }) },
    });
    const x = setup(stored, stale);
    await act(() => x.current.closeClass('c1'));
    expect(lifecycle.deactivateAssignment).not.toHaveBeenCalled();
  });

  it('turns in the closed class after the End grace, and leaves the last close to End', async () => {
    vi.useFakeTimers();
    const x = setup(
      assignment({
        periodAccess: {
          c1: row({ state: 'open' }),
          c2: row({ state: 'open' }),
        },
      })
    );
    await act(() => x.current.closeClass('c1'));
    expect(finalizeClassQuizResponses).not.toHaveBeenCalled();
    vi.advanceTimersByTime(END_TURN_IN_DELAY_MS);
    // The timer carries the closedAt it was scheduled for, so a later Reopen or Close makes it stale.
    expect(finalizeClassQuizResponses).toHaveBeenCalledWith(
      'a1',
      'c1',
      rows().c1.closedAt
    );
    (finalizeClassQuizResponses as Mock).mockClear();
    await act(() => x.current.closeClass('c2'));
    vi.advanceTimersByTime(END_TURN_IN_DELAY_MS);
    expect(lifecycle.deactivateAssignment).toHaveBeenCalledTimes(1);
    expect(finalizeClassQuizResponses).not.toHaveBeenCalled();
  });

  it('opening a class of a paused run pauses the other open classes before resuming', async () => {
    const x = setup(
      assignment({
        status: 'paused',
        periodAccess: {
          c1: row({ state: 'open' }),
          c2: row(),
          c3: row({ closedAt: 1 }),
          sched: row({ state: 'open', openAt: Date.now() + 60_000 }),
          clock: row({ state: 'open', closeAt: Date.now() - 60_000 }),
        },
      })
    );
    await act(() => x.current.openClass('c2'));
    expect(store.calls).toEqual(['start:c2', 'pause:c1', 'status:resume:a1']);
  });

  it('D9: reopening a class of an ended run stamps every sibling not closed by hand, Ready-looking and clock-closed ones included', async () => {
    vi.useFakeTimers();
    const T = Date.now();
    const x = setup(
      assignment({
        status: 'inactive',
        periodAccess: {
          c1: row({ closedAt: 5 }),
          c2: row({ state: 'open' }),
          c3: row({ closedAt: 6 }),
          c4: row(),
          c5: row({ state: 'open', closeAt: T - 60_000 }),
        },
      })
    );
    await act(() => x.current.reopenClass('c1'));
    expect(store.calls).toEqual([
      'reopen:c1',
      'close:c2',
      'close:c4',
      'close:c5',
      'status:reopen:a1',
      'status:resume:a1',
    ]);
    expect(rows().c3).toMatchObject({ closedAt: 6 });
    for (const k of ['c2', 'c4', 'c5']) expect(rows()[k].closedAt).toBe(T);
    const fired = () =>
      (finalizeClassQuizResponses as Mock).mock.calls.map((c: unknown[]) => [
        c[1],
        c[2],
      ]);
    // The long-closed class turns in at once; the newly stamped ones wait out their own grace.
    vi.advanceTimersByTime(0);
    expect(fired()).toEqual([['c3', 6]]);
    vi.advanceTimersByTime(END_TURN_IN_DELAY_MS - 1);
    expect(fired()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(fired()).toEqual([
      ['c3', 6],
      ['c2', T],
      ['c4', T],
      ['c5', T],
    ]);
  });

  it("a reopen inside End's grace still turns in the classes that stay closed", async () => {
    vi.useFakeTimers();
    const T = Date.now();
    const x = setup(
      assignment({
        periodAccess: {
          c1: row({ state: 'open' }),
          c2: row({ closedAt: T - 1_000 }),
        },
      })
    );
    await act(() => x.current.closeClass('c1'));
    expect(store.calls).toEqual(['status:end:a1']);
    vi.advanceTimersByTime(30_000);
    await act(() => x.current.reopenClass('c2'));
    vi.advanceTimersByTime(END_TURN_IN_DELAY_MS - 30_000 - 1);
    expect(finalizeClassQuizResponses).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(finalizeClassQuizResponses).toHaveBeenCalledTimes(1);
    expect(finalizeClassQuizResponses).toHaveBeenCalledWith('a1', 'c1', T);
  });

  it('Close for all classes closes every class, then ends the run', async () => {
    const x = setup(
      assignment({ periodAccess: { c1: row({ state: 'open' }), c2: row() } })
    );
    await act(() => x.current.closeAll());
    expect(store.calls).toEqual(['closeAll', 'status:end:a1']);
  });

  it('Move to Done closes every class, stamps doneAt, then ends the run', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(777);
    const x = setup(
      assignment({ periodAccess: { c1: row({ state: 'open' }), c2: row() } })
    );
    await act(() => x.current.moveToDone());
    expect(store.calls).toEqual([
      'closeAll',
      'mark:{"doneAt":777}',
      'status:end:a1',
    ]);
    vi.restoreAllMocks();
  });
});

describe('single line (D15)', () => {
  it('maps Close, Reopen and Pause onto the whole assignment', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(888);
    let x = setup(assignment({}));
    await act(() => x.current.closeClass(null));
    expect(store.calls).toEqual(['mark:{"closedAt":888}', 'status:end:a1']);
    store.calls = [];
    x = setup(assignment({ status: 'inactive', closedAt: 888 }));
    await act(() => x.current.reopenClass(null));
    expect(store.calls).toEqual(['status:reopen:a1', 'status:resume:a1']);
    store.calls = [];
    x = setup(assignment({}));
    await act(() => x.current.pauseClass(null));
    expect(store.calls).toEqual(['status:pause:a1']);
    vi.restoreAllMocks();
  });

  it('Open clears a future openAt on both docs so students get in now', async () => {
    const x = setup(
      assignment({ status: 'paused', openAt: Date.now() + 60_000 })
    );
    await act(() => x.current.openClass(null));
    expect(store.writes).toEqual([
      [SESSION, { openAt: null }],
      [ASSIGNMENT, { openAt: null }],
    ]);
    expect(store.calls).toEqual(['status:resume:a1']);
  });

  it('Reopen after the close time passed clears closeAt on both docs', async () => {
    const x = setup(
      assignment({
        status: 'inactive',
        closedAt: 5,
        openAt: 1,
        closeAt: Date.now() - 60_000,
      })
    );
    await act(() => x.current.reopenClass(null));
    expect(store.writes).toEqual([
      [SESSION, { closeAt: null }],
      [ASSIGNMENT, { closeAt: null }],
    ]);
  });
});

describe('guards (D15)', () => {
  it('a null key acts on the sole class of a one-class gate', async () => {
    const x = setup(assignment({ periodAccess: { only: row() } }));
    await act(() => x.current.openClass(null));
    expect(store.calls).toEqual(['start:only']);
  });

  it('a null key on a multi-class gate throws and writes nothing', async () => {
    const x = setup(assignment({ periodAccess: { c1: row(), c2: row() } }));
    await expect(x.current.closeClass(null)).rejects.toThrow(/Pick a class/);
    await expect(x.current.openClass(null)).rejects.toThrow(/Pick a class/);
    expect(store.writes).toEqual([]);
    expect(store.calls).toEqual([]);
  });

  it('throws for a teacher who does not own the assignment, before any write or End', async () => {
    authUid.uid = 'someone-else';
    const x = setup(
      assignment({ periodAccess: { c1: row({ state: 'open' }) } })
    );
    for (const run of [
      () => x.current.closeClass(null),
      () => x.current.closeClass('c1'),
      () => x.current.openClass('c1'),
      () => x.current.pauseClass('c1'),
      () => x.current.closeAll(),
      () => x.current.moveToDone(),
    ])
      await expect(run()).rejects.toThrow(/assigning teacher/);
    expect(lifecycle.deactivateAssignment).not.toHaveBeenCalled();
    expect(store.calls).toEqual([]);
    expect(store.writes).toEqual([]);
  });

  it('throws on a class key the assignment does not have, before any write', async () => {
    const x = setup(assignment({ periodAccess: { c1: row(), c2: row() } }));
    await expect(x.current.openClass('c9')).rejects.toThrow(/no class/);
    await expect(x.current.reopenClass('c9')).rejects.toThrow(/no class/);
    await expect(x.current.closeClass('c9')).rejects.toThrow(/no class/);
    expect(store.calls).toEqual([]);
    expect(store.writes).toEqual([]);
  });
});

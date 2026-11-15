import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_o: unknown, h: () => Promise<void>) => h,
}));
vi.mock('./quizSessionContent', () => ({
  withQuizSessionContent: (_ref: unknown, s: unknown) => Promise.resolve(s),
  isPeriodFrozen: () => false,
}));
vi.mock('./quizFinalize', () => ({
  sessionQuestionIds: () => [],
  buildQuizFinalizeUpdate: () => ({ status: 'completed' }),
}));

import { runFinalizeExpiredQuizAttempts } from './finalizeExpiredQuizAttempts';

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const ts = (ms: number) => ({ toMillis: () => ms });

function makeDb(
  session: Record<string, unknown>,
  responses: Record<string, Record<string, unknown>>
) {
  const updates: Record<string, Record<string, unknown>> = {};
  const sessionRef = {
    id: 's1',
    get: () => Promise.resolve({ exists: true, data: () => session }),
  };
  const snaps = Object.entries(responses).map(([id, data]) => ({
    id,
    data: () => data,
    ref: {
      id,
      path: `quiz_sessions/s1/responses/${id}`,
      parent: { parent: sessionRef },
    },
  }));
  const wheres: unknown[][] = [];
  const query = {
    where: (...args: unknown[]) => {
      wheres.push(args);
      return query;
    },
    orderBy: () => query,
    limit: () => query,
    startAfter: () => query,
    get: () => Promise.resolve({ docs: snaps, size: snaps.length }),
  };
  const db = {
    collectionGroup: () => query,
    runTransaction: async (
      fn: (tx: unknown) => Promise<boolean>
    ): Promise<boolean> =>
      fn({
        get: (ref: { id: string }) =>
          Promise.resolve({ data: () => responses[ref.id] }),
        update: (ref: { id: string }, d: Record<string, unknown>) => {
          updates[ref.id] = d;
        },
      }),
  };
  return { db, updates, wheres };
}

describe('runFinalizeExpiredQuizAttempts', () => {
  const session = {
    sessionMode: 'student',
    timeLimitMinutes: 10,
    status: 'active',
  };

  it('bounds the scan below so skipped old attempts cannot fill the read window', async () => {
    const { db, wheres } = makeDb(session, {});
    await runFinalizeExpiredQuizAttempts(db as never, NOW);
    const floor = wheres.find(
      ([f, op]) => f === 'attemptStartedAt' && op === '>'
    );
    const at = (floor?.[2] as { toMillis: () => number }).toMillis();
    expect(at).toBeGreaterThan(NOW - 3 * 24 * 60 * MIN);
    expect(at).toBeLessThan(NOW - 8 * 60 * MIN);
  });

  it('turns in an attempt past its limit as time up, and leaves a running one', async () => {
    const { db, updates } = makeDb(session, {
      late: { status: 'in-progress', attemptStartedAt: ts(NOW - 20 * MIN) },
      running: { status: 'in-progress', attemptStartedAt: ts(NOW - 5 * MIN) },
    });
    const res = await runFinalizeExpiredQuizAttempts(db as never, NOW);
    expect(res.finalized).toBe(1);
    expect(updates.late).toMatchObject({
      status: 'completed',
      timeUp: true,
      autoSubmitted: true,
    });
    expect(updates.running).toBeUndefined();
  });

  it('turns in an expired attempt even when the student set partHeld', async () => {
    const { db, updates } = makeDb(session, {
      held: {
        status: 'in-progress',
        partHeld: true,
        attemptStartedAt: ts(NOW - 20 * MIN),
      },
    });
    const res = await runFinalizeExpiredQuizAttempts(db as never, NOW);
    expect(res.finalized).toBe(1);
    expect(updates.held).toMatchObject({ status: 'completed', timeUp: true });
  });

  it('pages past a full page of skipped attempts to reach a new expiry, and keeps the floor in the query', async () => {
    const pausedRef = {
      id: 'paused',
      get: () =>
        Promise.resolve({
          exists: true,
          data: () => ({ ...session, status: 'paused' }),
        }),
    };
    const liveRef = {
      id: 's1',
      get: () => Promise.resolve({ exists: true, data: () => session }),
    };
    const snap = (id: string, startedAt: number, parent: unknown) => ({
      id,
      data: () => ({
        status: 'in-progress',
        attemptStartedAt: ts(startedAt),
      }),
      ref: {
        id,
        path: `quiz_sessions/${(parent as { id: string }).id}/responses/${id}`,
        parent: { parent },
      },
    });
    // 600 attempts in a paused session sort ahead of the one that just expired.
    const all = [
      ...Array.from({ length: 600 }, (_, i) =>
        snap(`p${i}`, NOW - 300 * MIN + i, pausedRef)
      ),
      snap('late', NOW - 20 * MIN, liveRef),
    ];
    const updates: Record<string, Record<string, unknown>> = {};
    const floors: number[] = [];
    const query = (from: number) => {
      const q = {
        where: (f: string, op: string, v: { toMillis: () => number }) => {
          if (f === 'attemptStartedAt' && op === '>') floors.push(v.toMillis());
          return q;
        },
        orderBy: () => q,
        limit: () => q,
        startAfter: (d: { id: string }) =>
          query(all.findIndex((s) => s.id === d.id) + 1),
        get: () => {
          const docs = all.slice(from, from + 500);
          return Promise.resolve({ docs, size: docs.length });
        },
      };
      return q;
    };
    const db = {
      collectionGroup: () => query(0),
      runTransaction: async (fn: (tx: unknown) => Promise<boolean>) =>
        fn({
          get: (ref: { id: string }) =>
            Promise.resolve({
              data: () => all.find((s) => s.id === ref.id)?.data(),
            }),
          update: (ref: { id: string }, d: Record<string, unknown>) => {
            updates[ref.id] = d;
          },
        }),
    };
    const res = await runFinalizeExpiredQuizAttempts(db as never, NOW);
    expect(res.candidates).toBe(601);
    expect(Object.keys(updates)).toEqual(['late']);
    expect(floors.length).toBeGreaterThan(0);
    for (const f of floors) expect(f).toBeGreaterThan(NOW - 3 * 24 * 60 * MIN);
  });

  it('skips a paused session', async () => {
    const { db, updates } = makeDb(
      { ...session, status: 'paused' },
      { late: { status: 'in-progress', attemptStartedAt: ts(NOW - 20 * MIN) } }
    );
    await runFinalizeExpiredQuizAttempts(db as never, NOW);
    expect(updates).toEqual({});
  });
});

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
  const query = {
    where: () => query,
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
  return { db, updates };
}

describe('runFinalizeExpiredQuizAttempts', () => {
  const session = {
    sessionMode: 'student',
    timeLimitMinutes: 10,
    status: 'active',
  };

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

  it('skips a paused session', async () => {
    const { db, updates } = makeDb(
      { ...session, status: 'paused' },
      { late: { status: 'in-progress', attemptStartedAt: ts(NOW - 20 * MIN) } }
    );
    await runFinalizeExpiredQuizAttempts(db as never, NOW);
    expect(updates).toEqual({});
  });
});

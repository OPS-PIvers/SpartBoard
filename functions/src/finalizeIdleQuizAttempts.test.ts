// Unit tests for the hourly `finalizeIdleQuizAttempts` sweep.
//
// Regression coverage for the pagination-cliff bug fixed alongside
// extracting the testable `runFinalizeIdleQuizAttempts` core (mirrors
// `gcPlcOrphans.test.ts` / `expireActivityWallShares.test.ts`):
//
// The stale-response query is ordered oldest-`lastWriteAt`-first. 'paused'
// sessions are skipped indefinitely (no write ever advances their
// `lastWriteAt`), so they permanently occupy the oldest slots in that order.
// Before the fix, a single un-paginated `.limit(MAX_READ_PER_RUN).get()`
// fetched only the SAME oldest N docs every run — once the paused/skip-only
// backlog exceeded that cap, any genuinely-idle ACTIVE response sorting
// after it was pushed out of the query window on every future run and would
// NEVER be auto-finalized. The fix paginates (`startAfter` cursor) up to a
// much larger ceiling so a run can walk past an arbitrarily large skip-only
// prefix and still reach real candidates.
//
// Stub Firestore mirrors the Admin SDK surface the sweep uses:
//   db.collectionGroup('responses').where(...).where(...)
//     .orderBy('lastWriteAt').orderBy(FieldPath.documentId())
//     .limit(n).startAfter(docSnap).get()
//   db.doc('quiz_sessions/{sid}') + db.getAll(...refs)
//   db.runTransaction(tx => { tx.get(ref); tx.update(ref, data); })

import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldPath: { documentId: vi.fn(() => '__name__') },
    Timestamp: {
      fromMillis: (ms: number) => ({
        toMillis: () => ms,
        toDate: () => new Date(ms),
      }),
    },
  }),
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));

import {
  runFinalizeIdleQuizAttempts,
  MAX_READ_PER_RUN,
  RESPONSE_PAGE_SIZE,
} from './finalizeIdleQuizAttempts';

const NOW = 1_700_000_000_000;
const MIN = 60 * 1000;
const IDLE_MS = 90 * MIN;

function tsVal(ms: number) {
  return { toMillis: () => ms };
}

// ===========================================================================
// Stub Firestore
// ===========================================================================

interface StubResponse {
  id: string;
  sid: string;
  data: Record<string, unknown>;
}

function makeStubDb(seed: {
  responses: StubResponse[];
  sessions: Record<string, Record<string, unknown>>;
}) {
  const responses = seed.responses.map((r) => ({ ...r, data: { ...r.data } }));
  const sessions: Record<string, Record<string, unknown>> = {
    ...seed.sessions,
  };

  type Filter = [string, string, unknown];

  function findResponse(path: string): StubResponse | undefined {
    const segments = path.split('/');
    const sid = segments[1];
    const id = segments[3];
    return responses.find((r) => r.sid === sid && r.id === id);
  }

  function fieldValue(r: StubResponse, field: string): unknown {
    if (field === '__name__') return r.id;
    const v = r.data[field];
    if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
      return (v as { toMillis: () => number }).toMillis();
    }
    return v;
  }

  function matches(r: StubResponse, filters: Filter[]): boolean {
    return filters.every(([field, op, value]) => {
      if (op === 'in') {
        return (
          Array.isArray(value) && (value as unknown[]).includes(r.data[field])
        );
      }
      if (op === '<') {
        const cutoffMs =
          value &&
          typeof (value as { toMillis?: unknown }).toMillis === 'function'
            ? (value as { toMillis: () => number }).toMillis()
            : (value as number);
        const actual = fieldValue(r, field);
        return typeof actual === 'number' && actual < cutoffMs;
      }
      throw new Error(`Unsupported op in stub: ${op}`);
    });
  }

  function compareValues(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    return (a as number | string) < (b as number | string) ? -1 : 1;
  }

  function responseRef(r: StubResponse) {
    return {
      path: `quiz_sessions/${r.sid}/responses/${r.id}`,
      get: () =>
        Promise.resolve({
          exists: true,
          data: () => ({ ...r.data }),
        }),
    };
  }

  function responsesQuery(
    filters: Filter[] = [],
    order: string[] = [],
    lim?: number,
    afterId?: string
  ): {
    where: (
      field: string,
      op: string,
      value: unknown
    ) => ReturnType<typeof responsesQuery>;
    orderBy: (field: unknown) => ReturnType<typeof responsesQuery>;
    limit: (n: number) => ReturnType<typeof responsesQuery>;
    startAfter: (cursor: { id: string }) => ReturnType<typeof responsesQuery>;
    get: () => Promise<{
      size: number;
      empty: boolean;
      docs: { id: string; ref: ReturnType<typeof responseRef> }[];
    }>;
  } {
    return {
      where: (field, op, value) =>
        responsesQuery([...filters, [field, op, value]], order, lim, afterId),
      orderBy: (field) =>
        responsesQuery(
          filters,
          [...order, typeof field === 'string' ? field : '__name__'],
          lim,
          afterId
        ),
      limit: (n) => responsesQuery(filters, order, n, afterId),
      startAfter: (cursor) => responsesQuery(filters, order, lim, cursor.id),
      get: () => {
        let rows = responses.filter((r) => matches(r, filters));
        if (order.length > 0) {
          rows = [...rows].sort((a, b) => {
            for (const field of order) {
              const cmp = compareValues(
                fieldValue(a, field),
                fieldValue(b, field)
              );
              if (cmp !== 0) return cmp;
            }
            return 0;
          });
        }
        if (afterId) {
          const afterRow = responses.find((r) => r.id === afterId);
          const afterValues = order.map((f) =>
            afterRow ? fieldValue(afterRow, f) : undefined
          );
          rows = rows.filter((r) => {
            for (let i = 0; i < order.length; i++) {
              const cmp = compareValues(
                fieldValue(r, order[i]),
                afterValues[i]
              );
              if (cmp !== 0) return cmp > 0;
            }
            return false;
          });
        }
        const sliced = lim === undefined ? rows : rows.slice(0, lim);
        return Promise.resolve({
          size: sliced.length,
          empty: sliced.length === 0,
          docs: sliced.map((r) => ({ id: r.id, ref: responseRef(r) })),
        });
      },
    };
  }

  const db = {
    collectionGroup: (name: string) => {
      if (name !== 'responses') {
        throw new Error(`Unexpected collectionGroup in stub: ${name}`);
      }
      return responsesQuery();
    },
    doc: (path: string) => ({ __sid: path.split('/')[1] }),
    getAll: (...refs: Array<{ __sid: string }>) =>
      Promise.resolve(
        refs.map((ref) => {
          const data = sessions[ref.__sid];
          return {
            id: ref.__sid,
            exists: data !== undefined,
            data: () => data,
          };
        })
      ),
    runTransaction: async (
      fn: (tx: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        update: (ref: { path: string }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>
    ) => {
      const tx = {
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          const r = findResponse(ref.path);
          if (r) Object.assign(r.data, data);
        },
      };
      return fn(tx);
    },
  };

  return {
    db: db as unknown as Parameters<typeof runFinalizeIdleQuizAttempts>[0],
    responses,
    sessions,
  };
}

// ===========================================================================
// Baseline behavior
// ===========================================================================

describe('runFinalizeIdleQuizAttempts', () => {
  it('finalizes a stale in-progress response on an active session', async () => {
    const { db, responses } = makeStubDb({
      responses: [
        {
          id: 'r1',
          sid: 'sess1',
          data: {
            status: 'in-progress',
            lastWriteAt: tsVal(NOW - IDLE_MS - MIN),
            answers: [{ questionId: 'q1', status: 'draft' }],
          },
        },
      ],
      sessions: { sess1: { status: 'active', createdAt: NOW - 2 * IDLE_MS } },
    });

    const result = await runFinalizeIdleQuizAttempts(db, NOW);

    expect(result.finalized).toBe(1);
    expect(responses[0].data.status).toBe('completed');
    expect(responses[0].data.autoSubmitted).toBe(true);
  });

  it('skips a response whose parent session is paused', async () => {
    const { db, responses } = makeStubDb({
      responses: [
        {
          id: 'r1',
          sid: 'sess1',
          data: {
            status: 'joined',
            lastWriteAt: tsVal(NOW - IDLE_MS - MIN),
          },
        },
      ],
      sessions: { sess1: { status: 'paused', createdAt: NOW - 2 * IDLE_MS } },
    });

    const result = await runFinalizeIdleQuizAttempts(db, NOW);

    expect(result.finalized).toBe(0);
    expect(result.skippedPaused).toBe(1);
    expect(responses[0].data.status).toBe('joined');
  });

  it('leaves a fresh (not-yet-idle) response untouched', async () => {
    const { db, responses } = makeStubDb({
      responses: [
        {
          id: 'r1',
          sid: 'sess1',
          data: { status: 'in-progress', lastWriteAt: tsVal(NOW - MIN) },
        },
      ],
      sessions: { sess1: { status: 'active', createdAt: NOW - 2 * IDLE_MS } },
    });

    const result = await runFinalizeIdleQuizAttempts(db, NOW);

    expect(result.staleFound).toBe(0);
    expect(responses[0].data.status).toBe('in-progress');
  });
});

// ===========================================================================
// Unresponded sweep-write (brief 2.2 / RR-08 sub-decisions 1 + 5)
// ===========================================================================

describe('runFinalizeIdleQuizAttempts — unresponded markers', () => {
  it('appends an abandoned marker for every publicQuestion with no answer', async () => {
    const { db, responses } = makeStubDb({
      responses: [
        {
          id: 'r1',
          sid: 'sess1',
          data: {
            status: 'in-progress',
            lastWriteAt: tsVal(NOW - IDLE_MS - MIN),
            answers: [{ questionId: 'q1', answer: 'a', status: 'draft' }],
          },
        },
      ],
      sessions: {
        sess1: {
          status: 'active',
          createdAt: NOW - 2 * IDLE_MS,
          completenessModel: 1,
          publicQuestions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
        },
      },
    });

    const result = await runFinalizeIdleQuizAttempts(db, NOW);

    expect(result.finalized).toBe(1);
    const answers = responses[0].data.answers as Record<string, unknown>[];
    expect(answers).toHaveLength(3);
    // The real answer is untouched apart from the draft promotion.
    const real = answers.find((a) => a.questionId === 'q1')!;
    expect(real.unresponded).toBeUndefined();
    expect(real.status).toBe('submitted');
    for (const qid of ['q2', 'q3']) {
      const marker = answers.find((a) => a.questionId === qid)!;
      expect(marker).toEqual({
        questionId: qid,
        answer: '',
        answeredAt: NOW,
        status: 'submitted',
        unresponded: 'abandoned',
      });
    }
    // The student answered one real question, so the attempt slot is used.
    expect(responses[0].data.completedAttempts).toBe(1);
  });

  it('marks every question abandoned for a zero-answer student without consuming an attempt slot', async () => {
    const { db, responses } = makeStubDb({
      responses: [
        {
          id: 'r1',
          sid: 'sess1',
          data: {
            status: 'joined',
            lastWriteAt: tsVal(NOW - IDLE_MS - MIN),
            answers: [],
          },
        },
      ],
      sessions: {
        sess1: {
          status: 'active',
          createdAt: NOW - 2 * IDLE_MS,
          completenessModel: 1,
          publicQuestions: [{ id: 'q1' }, { id: 'q2' }],
        },
      },
    });

    const result = await runFinalizeIdleQuizAttempts(db, NOW);

    expect(result.finalized).toBe(1);
    const answers = responses[0].data.answers as Record<string, unknown>[];
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.unresponded === 'abandoned')).toBe(true);
    // Critical regression: synthetic markers must NOT flip the
    // "don't consume an attempt slot" rule for a student who never engaged.
    expect(responses[0].data.completedAttempts).toBeUndefined();
  });

  it('writes no unresponded field when the session has no publicQuestions', async () => {
    const { db, responses } = makeStubDb({
      responses: [
        {
          id: 'r1',
          sid: 'sess1',
          data: {
            status: 'in-progress',
            lastWriteAt: tsVal(NOW - IDLE_MS - MIN),
            answers: [{ questionId: 'q1', answer: 'a' }],
          },
        },
      ],
      // Opted-in session, but no publicQuestions field at all.
      sessions: {
        sess1: {
          status: 'active',
          createdAt: NOW - 2 * IDLE_MS,
          completenessModel: 1,
        },
      },
    });

    await runFinalizeIdleQuizAttempts(db, NOW);

    const answers = responses[0].data.answers as Record<string, unknown>[];
    expect(answers).toEqual([{ questionId: 'q1', answer: 'a' }]);
  });

  it('does not duplicate a question that already carries an unresponded entry', async () => {
    const { db, responses } = makeStubDb({
      responses: [
        {
          id: 'r1',
          sid: 'sess1',
          data: {
            status: 'in-progress',
            lastWriteAt: tsVal(NOW - IDLE_MS - MIN),
            answers: [
              { questionId: 'q1', answer: '', unresponded: 'passed' },
              { questionId: 'q2', answer: 'b' },
            ],
          },
        },
      ],
      sessions: {
        sess1: {
          status: 'active',
          createdAt: NOW - 2 * IDLE_MS,
          completenessModel: 1,
          publicQuestions: [{ id: 'q1' }, { id: 'q2' }],
        },
      },
    });

    await runFinalizeIdleQuizAttempts(db, NOW);

    const answers = responses[0].data.answers as Record<string, unknown>[];
    expect(answers).toHaveLength(2);
    expect(answers.find((a) => a.questionId === 'q1')!.unresponded).toBe(
      'passed'
    );
  });

  // Deploy gate: functions/ ships to the shared production project on every
  // dev-paul push, so a session created by the OLD client (no marker) must be
  // finalized exactly as it was before this feature landed.
  it('writes no synthetic entries for a legacy session with no completenessModel marker', async () => {
    const { db, responses } = makeStubDb({
      responses: [
        {
          id: 'r1',
          sid: 'sess1',
          data: {
            status: 'in-progress',
            lastWriteAt: tsVal(NOW - IDLE_MS - MIN),
            answers: [{ questionId: 'q1', answer: 'a', status: 'draft' }],
          },
        },
      ],
      sessions: {
        sess1: {
          status: 'active',
          createdAt: NOW - 2 * IDLE_MS,
          // No `completenessModel` — an old-client session with skipped questions.
          publicQuestions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
        },
      },
    });

    const result = await runFinalizeIdleQuizAttempts(db, NOW);

    expect(result.finalized).toBe(1);
    const answers = responses[0].data.answers as Record<string, unknown>[];
    // Pre-PR behaviour exactly: the draft is promoted, nothing is appended.
    expect(answers).toEqual([
      { questionId: 'q1', answer: 'a', status: 'submitted' },
    ]);
    expect(responses[0].data.completedAttempts).toBe(1);
    expect(responses[0].data.status).toBe('completed');
    expect(responses[0].data.autoSubmitted).toBe(true);
  });

  it('writes no synthetic entries for a legacy zero-answer session', async () => {
    const { db, responses } = makeStubDb({
      responses: [
        {
          id: 'r1',
          sid: 'sess1',
          data: {
            status: 'joined',
            lastWriteAt: tsVal(NOW - IDLE_MS - MIN),
            answers: [],
          },
        },
      ],
      sessions: {
        sess1: {
          status: 'active',
          createdAt: NOW - 2 * IDLE_MS,
          publicQuestions: [{ id: 'q1' }, { id: 'q2' }],
        },
      },
    });

    await runFinalizeIdleQuizAttempts(db, NOW);

    expect(responses[0].data.answers).toEqual([]);
    expect(responses[0].data.completedAttempts).toBeUndefined();
  });
});

// ===========================================================================
// Pagination regression — a genuinely-idle ACTIVE response that sorts past a
// large permanently-paused backlog (by lastWriteAt ascending) must still be
// read and finalized in the same run. Before the fix, a single un-paginated
// `.limit(MAX_READ_PER_RUN).get()` silently dropped it from every run's
// query window forever.
// ===========================================================================

describe('runFinalizeIdleQuizAttempts — pagination past the first page', () => {
  it('still finalizes an active-session response sorting past RESPONSE_PAGE_SIZE paused fillers', async () => {
    // A backlog of permanently-paused responses, all older (smaller
    // lastWriteAt) than the target — exceeds a single page size so the
    // target is guaranteed to sort past the first `.get()` round trip.
    const fillerCount = RESPONSE_PAGE_SIZE + 5;
    const sessions: Record<string, Record<string, unknown>> = {};
    const responses: StubResponse[] = [];
    for (let i = 0; i < fillerCount; i++) {
      const sid = `paused-${String(i).padStart(6, '0')}`;
      sessions[sid] = { status: 'paused', createdAt: NOW - 5 * IDLE_MS };
      responses.push({
        // Doc ids must be globally unique across sids — the stub's
        // startAfter cursor (mirroring the production
        // orderBy(FieldPath.documentId()) tiebreaker) resolves the cursor
        // doc by id alone, same as a real Firestore document reference.
        id: sid,
        sid,
        data: {
          status: 'joined',
          // Oldest-first: every filler predates the target so it always
          // sorts ahead of it in the orderBy('lastWriteAt') query.
          lastWriteAt: tsVal(NOW - IDLE_MS - 10 * MIN - i),
        },
      });
    }
    // The target: an ACTIVE session, genuinely idle past the threshold,
    // whose lastWriteAt sorts AFTER every filler above.
    sessions['active-target'] = {
      status: 'active',
      createdAt: NOW - 5 * IDLE_MS,
    };
    responses.push({
      id: 'active-target',
      sid: 'active-target',
      data: {
        status: 'in-progress',
        lastWriteAt: tsVal(NOW - IDLE_MS - MIN),
        answers: [{ questionId: 'q1', status: 'draft' }],
      },
    });

    const { db, responses: liveResponses } = makeStubDb({
      responses,
      sessions,
    });

    const result = await runFinalizeIdleQuizAttempts(db, NOW);

    const target = liveResponses.find((r) => r.sid === 'active-target')!;
    expect(target.data.status).toBe('completed');
    expect(target.data.autoSubmitted).toBe(true);
    expect(result.finalized).toBeGreaterThanOrEqual(1);
    expect(result.staleFound).toBeGreaterThan(fillerCount);
  }, 20000);

  it('sanity: RESPONSE_PAGE_SIZE is smaller than MAX_READ_PER_RUN (pagination is actually exercised)', () => {
    expect(RESPONSE_PAGE_SIZE).toBeLessThan(MAX_READ_PER_RUN);
  });
});

describe('finalizeIdleQuizAttempts — scheduled wrapper', () => {
  it('imports and exposes the onSchedule handler', async () => {
    const mod = await import('./finalizeIdleQuizAttempts');
    expect(typeof mod.finalizeIdleQuizAttempts).toBe('function');
  });
});

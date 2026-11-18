import { describe, it, expect, vi } from 'vitest';

vi.mock('./functionsInit', () => ({}));
vi.mock('./firebaseAdmin', () => ({ firestore: () => ({}) }));

import {
  compactPurgedLog,
  planLogPurge,
  purgeCutoff,
  deleteStrayChunks,
  purgeResponse,
} from './writingLogPurge';

const AUG_1 = Date.UTC(2027, 7, 1, 8);
const CUTOFF = purgeCutoff(AUG_1);
const JUNE = Date.UTC(2027, 5, 10);
const JULY = Date.UTC(2027, 6, 20);

describe('purgeCutoff', () => {
  it('is 1 July, midnight Central, of the run year', () => {
    expect(new Date(CUTOFF).toISOString()).toBe('2027-07-01T05:00:00.000Z');
  });
});

describe('compactPurgedLog', () => {
  it('keeps only pastes and untyped additions with their text', () => {
    const log =
      'Tabc;0:H;5:i;P0,2,,pasted%3B text;S9,,,dictated;R0,0,,old;3,1,1,';
    expect(compactPurgedLog(log)).toBe('P0,2,,pasted%3B text;S9,,,dictated');
    expect(compactPurgedLog(compactPurgedLog(log))).toBe(compactPurgedLog(log));
  });

  it('is empty for a log of typing only', () => {
    expect(compactPurgedLog('Tabc;0:H;5:i')).toBe('');
  });
});

describe('planLogPurge', () => {
  const chunks = [
    { id: '0', log: 'Tabc;0:Hi;P0,2,,pasted' },
    { id: '1', log: '0:more typing' },
  ];

  it('purges a piece with no writing since 1 July: keeps pastes, deletes typing, stops recording', () => {
    const plan = planLogPurge({ summary: {} }, chunks, JUNE, CUTOFF, AUG_1);
    expect(plan).toEqual({
      rewrite: [{ id: '0', log: 'P0,2,,pasted' }],
      remove: ['1'],
      patch: { logPurgedAt: AUG_1, 'summary.logStoppedAt': AUG_1 },
    });
  });

  it('keeps an earlier stop time from a full log', () => {
    const plan = planLogPurge(
      { summary: { logStoppedAt: 5 } },
      chunks,
      JUNE,
      CUTOFF,
      AUG_1
    );
    expect(plan?.patch).toEqual({ logPurgedAt: AUG_1 });
  });

  it('leaves a piece written since 1 July (server time) until next year', () => {
    expect(
      planLogPurge({ summary: {} }, chunks, JULY, CUTOFF, AUG_1)
    ).toBeNull();
    // A device clock set to the past does not count: only server write times do.
    expect(
      planLogPurge({ summary: { savedAt: JUNE } }, chunks, JULY, CUTOFF, AUG_1)
    ).toBeNull();
  });

  it('skips a piece already purged or with no log', () => {
    expect(
      planLogPurge({ summary: {}, logPurgedAt: 1 }, chunks, JUNE, CUTOFF, AUG_1)
    ).toBeNull();
    expect(planLogPurge({ summary: {} }, [], JUNE, CUTOFF, AUG_1)).toBeNull();
  });
});

describe('chunk ids the purge reads (security #6)', () => {
  const fakeRef = (ids: string[]) => {
    const deleted: string[] = [];
    const docRef = (id: string) => ({ id, path: `log/${id}` });
    const ref = {
      firestore: {
        batch: () => {
          const ops: string[] = [];
          return {
            delete: (d: { id: string }) => ops.push(d.id),
            commit: () => {
              deleted.push(...ops);
              return Promise.resolve();
            },
          };
        },
      },
      collection: () => ({
        doc: docRef,
        select: () => ({
          get: () =>
            Promise.resolve({
              docs: ids.map((id) => ({ id, ref: docRef(id) })),
            }),
        }),
      }),
    };
    return { ref, deleted };
  };

  it('deletes only log docs a save could not have written', async () => {
    const { ref, deleted } = fakeRef(['0', '3', '9', '0.5', '10', 'x']);
    await deleteStrayChunks(ref as never);
    expect(deleted).toEqual(['0.5', '10', 'x']);
  });

  it('reads chunks 0 to 9 by id, never the whole collection', async () => {
    const { ref } = fakeRef([]);
    const getAll = vi.fn((...refs: { id: string }[]) =>
      Promise.resolve(refs.map((r) => ({ id: r.id, exists: false })))
    );
    const db = {
      runTransaction: (fn: (tx: unknown) => Promise<boolean>) =>
        fn({
          get: () =>
            Promise.resolve({
              exists: true,
              data: () => ({}),
              updateTime: undefined,
            }),
          getAll,
        }),
    };
    await expect(purgeResponse(db as never, ref as never, 0, 0)).resolves.toBe(
      false
    );
    expect(getAll.mock.calls[0].map((r) => r.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i))
    );
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('firebase-functions/logger', () => ({ info: vi.fn() }));

const h = vi.hoisted(
  (): {
    pages: Record<string, number[]>;
    wheres: unknown[][];
    deleted: string[];
    updated: Array<[string, unknown]>;
  } => ({ pages: {}, wheres: [], deleted: [], updated: [] })
);

vi.mock('./firebaseAdmin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    Timestamp: { fromMillis: (ms: number) => ({ ms }) },
    FieldValue: { delete: () => 'DELETE' },
  }),
}));

import {
  runTourAnchorSweep,
  TOUR_ANCHOR_RETENTION_MS,
} from './tourAnchorSweep';

const fakeDb = () =>
  ({
    collection: (name: string) => ({
      where: (...args: unknown[]) => {
        h.wheres.push([name, ...args]);
        const key = `${name}.${String(args[0])}`;
        return {
          limit: () => ({
            get: () => {
              const size = h.pages[key].shift() ?? 0;
              const docs = Array.from({ length: size }, (_, i) => ({
                ref: `${key}/${i}`,
                // The first requested item has a step, so the sweep keeps it.
                get: () => (i === 0 ? [{ setId: 's', stepId: 'a' }] : []),
              }));
              return Promise.resolve({ empty: size === 0, size, docs });
            },
          }),
        };
      },
    }),
    batch: () => ({
      delete: (ref: string) => h.deleted.push(ref),
      update: (ref: string, data: unknown) => h.updated.push([ref, data]),
      commit: () => Promise.resolve(),
    }),
  }) as never;

beforeEach(() => {
  h.pages = {
    'tour_anchor_queue.reboundAt': [2],
    'tour_anchor_batches.createdAt': [400, 1],
    'tour_anchor_queue.requestedAt': [3],
  };
  h.wheres = [];
  h.deleted = [];
  h.updated = [];
});

describe('runTourAnchorSweep', () => {
  it('deletes rebound items and batches older than 90 days, page by page', async () => {
    const now = 200 * 24 * 60 * 60 * 1000;
    const result = await runTourAnchorSweep(fakeDb(), now);
    const cutoff = { ms: now - TOUR_ANCHOR_RETENTION_MS };
    expect(h.wheres).toEqual([
      ['tour_anchor_queue', 'reboundAt', '<', cutoff],
      ['tour_anchor_batches', 'createdAt', '<', cutoff],
      ['tour_anchor_queue', 'requestedAt', '<', cutoff],
    ]);
    expect(result).toEqual({ rebound: 2, batches: 401, requested: 2 });
    expect(h.deleted).toHaveLength(405);
    expect(h.deleted).not.toContain('tour_anchor_queue.requestedAt/0');
    expect(h.updated).toEqual([
      ['tour_anchor_queue.requestedAt/0', { requestedAt: 'DELETE' }],
    ]);
  });
});

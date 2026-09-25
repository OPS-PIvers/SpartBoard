import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('firebase-functions/logger', () => ({ info: vi.fn() }));

const h = vi.hoisted(() => ({
  pages: {} as Record<string, number[]>,
  wheres: [] as unknown[][],
  deleted: [] as string[],
}));

vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    Timestamp: { fromMillis: (ms: number) => ({ ms }) },
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
        return {
          limit: () => ({
            get: () => {
              const size = h.pages[name].shift() ?? 0;
              const docs = Array.from({ length: size }, (_, i) => ({
                ref: `${name}/${i}`,
              }));
              return Promise.resolve({ empty: size === 0, size, docs });
            },
          }),
        };
      },
    }),
    batch: () => ({
      delete: (ref: string) => h.deleted.push(ref),
      commit: () => Promise.resolve(),
    }),
  }) as never;

beforeEach(() => {
  h.pages = { tour_anchor_queue: [2], tour_anchor_batches: [400, 1] };
  h.wheres = [];
  h.deleted = [];
});

describe('runTourAnchorSweep', () => {
  it('deletes rebound items and batches older than 90 days, page by page', async () => {
    const now = 200 * 24 * 60 * 60 * 1000;
    const result = await runTourAnchorSweep(fakeDb(), now);
    const cutoff = { ms: now - TOUR_ANCHOR_RETENTION_MS };
    expect(h.wheres).toEqual([
      ['tour_anchor_queue', 'reboundAt', '<', cutoff],
      ['tour_anchor_batches', 'createdAt', '<', cutoff],
    ]);
    expect(result).toEqual({ rebound: 2, batches: 401 });
    expect(h.deleted).toHaveLength(403);
  });
});

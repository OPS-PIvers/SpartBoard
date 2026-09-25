import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import type { TourAnchorQueueItem, UnmappedQueueEntry } from './anchorQueue';

const h = vi.hoisted(() => ({
  existing: new Set<string>(),
  sets: [] as Array<{
    path: string;
    data: Record<string, unknown>;
    opts?: unknown;
  }>,
  updates: [] as Array<{ path: string; data: Record<string, unknown> }>,
  failUpdate: new Set<string>(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isConfigured: true }));
vi.mock('firebase/firestore', () => {
  let auto = 0;
  return {
    collection: (_db: unknown, coll: string) => ({ coll }),
    doc: (a: { coll?: string }, coll?: string, id?: string) =>
      coll ? { path: `${coll}/${id}` } : { path: `${a.coll}/auto-${++auto}` },
    arrayUnion: (...values: unknown[]) => ({ op: 'union', values }),
    arrayRemove: (...values: unknown[]) => ({ op: 'remove', values }),
    serverTimestamp: () => 'now',
    runTransaction: async (
      _db: unknown,
      fn: (tx: unknown) => Promise<void>
    ) => {
      const tx = {
        get: (ref: { path: string }) =>
          Promise.resolve({ exists: () => h.existing.has(ref.path) }),
        set: (
          ref: { path: string },
          data: Record<string, unknown>,
          opts?: unknown
        ) => {
          h.sets.push({ path: ref.path, data, opts });
        },
      };
      await fn(tx);
    },
    updateDoc: (ref: { path: string }, data: Record<string, unknown>) => {
      if (h.failUpdate.has(ref.path)) return Promise.reject(new Error('gone'));
      h.updates.push({ path: ref.path, data });
      return Promise.resolve();
    },
    onSnapshot: vi.fn(),
  };
});

import {
  enqueueUnmappedAnchors,
  rebindQueueItem,
  removeQueueOccurrences,
} from './anchorQueueStore';

const FP1 = '1'.repeat(40);
const FP2 = '2'.repeat(40);
const context = {
  suggestedId: 'button.start',
  role: 'button',
  name: 'start',
  widgetType: null,
  pathname: '/',
  nearestAnchor: null,
  ancestors: [{ tag: 'button' }],
  htmlExcerpt: '<button>Start</button>',
};
const entry = (fingerprint: string, stepId: string): UnmappedQueueEntry => ({
  fingerprint,
  context,
  occurrences: [{ setId: 'set-1', stepId }],
});

beforeEach(() => {
  h.existing.clear();
  h.sets = [];
  h.updates = [];
  h.failUpdate.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('enqueueUnmappedAnchors', () => {
  it('creates new items as open, merges existing ones without touching status, then writes one batch', async () => {
    h.existing.add(`tour_anchor_queue/${FP2}`);
    await enqueueUnmappedAnchors('set-1', [entry(FP1, 'a'), entry(FP2, 'b')]);

    expect(h.sets).toHaveLength(3);
    const [created, merged, batch] = h.sets;
    expect(created).toMatchObject({
      path: `tour_anchor_queue/${FP1}`,
      opts: { merge: true },
      data: {
        ...context,
        fingerprint: FP1,
        status: 'open',
        firstSeenAt: 'now',
        occurrences: { op: 'union', values: [{ setId: 'set-1', stepId: 'a' }] },
      },
    });
    expect(merged.path).toBe(`tour_anchor_queue/${FP2}`);
    expect(merged.opts).toEqual({ merge: true });
    expect(merged.data).not.toHaveProperty('status');
    expect(merged.data).not.toHaveProperty('firstSeenAt');
    expect(merged.data.occurrences).toEqual({
      op: 'union',
      values: [{ setId: 'set-1', stepId: 'b' }],
    });
    expect(batch.path).toMatch(/^tour_anchor_batches\//);
    expect(batch.data).toEqual({
      setId: 'set-1',
      fingerprints: [FP1, FP2],
      createdAt: 'now',
    });
  });

  it('writes nothing for a recording with no untagged clicks', async () => {
    await enqueueUnmappedAnchors('set-1', []);
    expect(h.sets).toEqual([]);
  });
});

describe('removeQueueOccurrences', () => {
  it('removes each deleted step from its item and skips a missing item', async () => {
    h.failUpdate.add(`tour_anchor_queue/${FP2}`);
    await removeQueueOccurrences([
      { fingerprint: FP1, setId: 'set-1', stepId: 'a' },
      { fingerprint: FP1, setId: 'set-1', stepId: 'c' },
      { fingerprint: FP2, setId: 'set-1', stepId: 'b' },
    ]);
    expect(h.updates).toEqual([
      {
        path: `tour_anchor_queue/${FP1}`,
        data: {
          occurrences: {
            op: 'remove',
            values: [
              { setId: 'set-1', stepId: 'a' },
              { setId: 'set-1', stepId: 'c' },
            ],
          },
          updatedAt: 'now',
        },
      },
    ]);
  });
});

describe('rebindQueueItem', () => {
  const item = (anchorId: string): TourAnchorQueueItem => ({
    ...context,
    fingerprint: FP1,
    status: 'pr-open',
    anchorId,
    occurrences: [
      { setId: 'set-1', stepId: 'a' },
      { setId: 'gone', stepId: 'x' },
    ],
  });
  const stored = {
    id: 'set-1',
    updatedAt: 10,
    steps: [
      { id: 'a', tour: { anchor: '', action: 'click', unmapped: FP1 } },
      { id: 'b', tour: { anchor: 'sidebar.boards', action: 'click' } },
    ],
  } as unknown as GuidedLearningSet;

  it('rewrites the affected steps with a guarded save, then marks the item rebound', async () => {
    const load = vi.fn((id: string) =>
      Promise.resolve(id === 'set-1' ? stored : null)
    );
    const save = vi.fn(() => Promise.resolve());
    const count = await rebindQueueItem(item('sidebar.boards'), { load, save });

    expect(count).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
    const [saved, guard] = save.mock.calls[0] as unknown as [
      GuidedLearningSet,
      { expectedUpdatedAt: number },
    ];
    expect(guard).toEqual({ expectedUpdatedAt: 10 });
    expect(saved.updatedAt).toBeGreaterThan(10);
    expect(saved.steps[0].tour).toEqual({
      anchor: 'sidebar.boards',
      action: 'click',
    });
    expect(h.updates).toEqual([
      {
        path: `tour_anchor_queue/${FP1}`,
        data: { status: 'rebound', reboundAt: 'now', updatedAt: 'now' },
      },
    ]);
  });

  it('refuses an anchor this build does not register', async () => {
    const save = vi.fn();
    await expect(
      rebindQueueItem(item('not.deployed.yet'), {
        load: () => Promise.resolve(stored),
        save,
      })
    ).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
    expect(h.updates).toEqual([]);
  });

  it('prunes stale places instead of marking rebound when no step is left', async () => {
    const gone = {
      ...stored,
      steps: stored.steps.filter((s) => s.id !== 'a'),
    } as GuidedLearningSet;
    const save = vi.fn(() => Promise.resolve());
    const count = await rebindQueueItem(item('sidebar.boards'), {
      load: () => Promise.resolve(gone),
      save,
    });
    expect(count).toBe(0);
    expect(save).not.toHaveBeenCalled();
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].data).not.toHaveProperty('status');
    expect(h.updates[0].data.occurrences).toMatchObject({ op: 'remove' });
  });

  it('leaves the item unmarked when a save conflicts', async () => {
    await expect(
      rebindQueueItem(item('sidebar.boards'), {
        load: () => Promise.resolve(stored),
        save: () => Promise.reject(new Error('conflict')),
      })
    ).rejects.toThrow('conflict');
    expect(h.updates).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fb = vi.hoisted(() => ({
  bypass: false,
  user: { uid: 'teacher-1' },
  stored: null as Record<string, unknown> | null,
  fail: null as Error | null,
  hang: false,
  updates: [] as unknown[],
}));

vi.mock('@/config/firebase', () => ({
  get isAuthBypass() {
    return fb.bypass;
  },
  get auth() {
    return { currentUser: fb.user };
  },
  db: {},
}));
vi.mock('@/utils/viewAsTab', () => ({ isViewAsTab: false }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  runTransaction: async (
    _db: unknown,
    fn: (tx: unknown) => Promise<unknown>
  ) => {
    if (fb.hang) return new Promise(() => undefined);
    if (fb.fail) throw fb.fail;
    return fn({
      get: () =>
        Promise.resolve({
          exists: () => fb.stored !== null,
          data: () => fb.stored,
        }),
      update: (_ref: unknown, patch: Record<string, unknown>) => {
        fb.updates.push(patch);
        fb.stored = { ...fb.stored, ...patch };
      },
    });
  },
}));

import { claimBoardTrigger, nextTriggerClaims } from './boardTriggerClaim';

describe('nextTriggerClaims', () => {
  const ids = new Set(['r1', 'n1']);
  it('claims a value newer than the stored one', () => {
    expect(nextTriggerClaims({ r1: 100 }, ids, 'r1', 200)).toEqual({ r1: 200 });
  });
  it('refuses a value already claimed or older', () => {
    expect(nextTriggerClaims({ r1: 200 }, ids, 'r1', 200)).toBeNull();
    expect(nextTriggerClaims({ r1: 300 }, ids, 'r1', 200)).toBeNull();
  });
  it('claims a first trigger and drops claims for removed widgets', () => {
    expect(nextTriggerClaims({ gone: 5, n1: 7 }, ids, 'r1', 200)).toEqual({
      n1: 7,
      r1: 200,
    });
    expect(nextTriggerClaims(undefined, ids, 'r1', 1)).toEqual({ r1: 1 });
  });
});

describe('claimBoardTrigger', () => {
  beforeEach(() => {
    fb.bypass = false;
    fb.user = { uid: 'teacher-1' };
    fb.stored = { widgets: [{ id: 'r1' }] };
    fb.fail = null;
    fb.hang = false;
    fb.updates = [];
  });
  afterEach(() => vi.useRealTimers());

  it('lets exactly one of two devices act on the same trigger', async () => {
    const first = await claimBoardTrigger('board-1', 'r1', 500);
    const second = await claimBoardTrigger('board-1', 'r1', 500);
    expect([first, second]).toEqual([true, false]);
    expect(fb.updates).toEqual([{ triggerClaims: { r1: 500 } }]);
    expect(await claimBoardTrigger('board-1', 'r1', 600)).toBe(true);
  });

  it('acts as before when it cannot claim', async () => {
    fb.stored = null;
    expect(await claimBoardTrigger('board-1', 'r1', 500)).toBe(true);
    fb.stored = { widgets: [] };
    fb.fail = Object.assign(new Error('offline'), { code: 'unavailable' });
    expect(await claimBoardTrigger('board-1', 'r1', 500)).toBe(true);
    fb.fail = null;
    expect(await claimBoardTrigger(undefined, 'r1', 500)).toBe(true);
    fb.user = null;
    expect(await claimBoardTrigger('board-1', 'r1', 500)).toBe(true);
    fb.user = { uid: 'teacher-1' };
    fb.bypass = true;
    expect(await claimBoardTrigger('board-1', 'r1', 500)).toBe(true);
    expect(fb.updates).toEqual([]);
  });

  it('acts after a short wait when the claim never answers', async () => {
    vi.useFakeTimers();
    fb.hang = true;
    const result = claimBoardTrigger('board-1', 'r1', 500);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await result).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextUpDrainLease } from '@/types';
import {
  createNextUpDrainController,
  decideDrainClaim,
  type DrainClaim,
} from './nextUpDrainLease';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

describe('decideDrainClaim', () => {
  it('takes a free lease', () => {
    expect(decideDrainClaim(undefined, 'me')).toEqual({
      claim: { won: true, acquired: true, seq: 1 },
      write: { clientId: 'me', seq: 1 },
    });
  });

  it('keeps its own lease without writing', () => {
    expect(decideDrainClaim({ clientId: 'me', seq: 4 }, 'me')).toEqual({
      claim: { won: true, acquired: false, seq: 4 },
      write: null,
    });
  });

  it('loses to another tab', () => {
    expect(decideDrainClaim({ clientId: 'other', seq: 4 }, 'me')).toEqual({
      claim: { won: false, acquired: false, seq: 4 },
      write: null,
    });
  });

  it('takes over only the stalled lease it saw', () => {
    const lease = { clientId: 'other', seq: 4 };
    expect(decideDrainClaim(lease, 'me', 4).write).toEqual({
      clientId: 'me',
      seq: 5,
    });
    // A third tab took over first: the lease moved on, so this tab loses.
    expect(
      decideDrainClaim({ clientId: 'third', seq: 5 }, 'me', 4).claim.won
    ).toBe(false);
  });

  it('treats a malformed lease as free', () => {
    expect(decideDrainClaim({ clientId: 3 }, 'me').claim).toEqual({
      won: true,
      acquired: true,
      seq: 1,
    });
  });
});

const entry = (id: string) => ({ id });

/** Session doc stand-in that serializes claims like a transaction. */
function fakeSession() {
  let lease: NextUpDrainLease | undefined;
  return {
    claimFor:
      (clientId: string) =>
      (takeoverSeq?: number): Promise<DrainClaim> => {
        const { claim, write } = decideDrainClaim(lease, clientId, takeoverSeq);
        if (write) lease = write;
        return Promise.resolve(claim);
      },
    lease: () => lease,
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('Next Up drain controller across two tabs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lets only one tab drain the same joins', async () => {
    const session = fakeSession();
    const drainA = vi.fn(() => Promise.resolve());
    const drainB = vi.fn(() => Promise.resolve());
    const a = createNextUpDrainController({
      claim: session.claimFor('a'),
      drain: drainA,
    });
    const b = createNextUpDrainController({
      claim: session.claimFor('b'),
      drain: drainB,
    });

    a.onEntries([entry('x')]);
    b.onEntries([entry('x')]);
    await flush();

    expect(drainA).toHaveBeenCalledTimes(1);
    expect(drainB).not.toHaveBeenCalled();
    // The holder drained them, so the other tab never takes over.
    a.onEntries([]);
    b.onEntries([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(drainB).not.toHaveBeenCalled();
    a.stop();
    b.stop();
  });

  it('takes over when the holder leaves joins untouched for the window', async () => {
    const session = fakeSession();
    const drainA = vi.fn(() => Promise.resolve());
    const drainB = vi.fn(() => Promise.resolve());
    const a = createNextUpDrainController({
      claim: session.claimFor('a'),
      drain: drainA,
    });
    a.onEntries([entry('x')]);
    await flush();
    // Tab A goes to sleep without releasing the lease.
    a.stop();

    const b = createNextUpDrainController({
      claim: session.claimFor('b'),
      drain: drainB,
      takeoverMs: 10_000,
    });
    b.onEntries([entry('y')]);
    await flush();
    expect(drainB).not.toHaveBeenCalled();

    // More joins arriving don't take over early.
    b.onEntries([entry('y'), entry('z')]);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(drainB).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_500);
    expect(drainB).toHaveBeenCalledTimes(1);
    // A fresh holder reloads before it drains.
    expect(drainB).toHaveBeenCalledWith([entry('y'), entry('z')], true);
    expect(session.lease()).toEqual({ clientId: 'b', seq: 2 });
    b.stop();
  });

  it('stands down once another tab has taken its lease', async () => {
    const session = fakeSession();
    const drainA = vi.fn(() => Promise.resolve());
    const a = createNextUpDrainController({
      claim: session.claimFor('a'),
      drain: drainA,
    });
    a.onEntries([entry('x')]);
    await flush();
    expect(a.holding()).toBe(true);

    // Tab B took over while A slept.
    await session.claimFor('b')(1);
    a.onEntries([entry('y')]);
    await flush();
    expect(drainA).toHaveBeenCalledTimes(1);
    expect(a.holding()).toBe(false);
    a.stop();
  });

  it('retries a drain whose Drive write failed', async () => {
    const session = fakeSession();
    const drain = vi
      .fn<(entries: { id: string }[], acquired: boolean) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Drive down'))
      .mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const a = createNextUpDrainController({
      claim: session.claimFor('a'),
      drain,
      retryMs: 10_000,
    });
    a.onEntries([entry('x')]);
    await flush();
    expect(drain).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(drain).toHaveBeenCalledTimes(2);
    a.stop();
  });

  it('drains as before when the claim falls back', async () => {
    const drain = vi.fn(() => Promise.resolve());
    const a = createNextUpDrainController({
      claim: () => Promise.resolve({ won: true, acquired: false, seq: -1 }),
      drain,
    });
    a.onEntries([entry('x')]);
    await flush();
    expect(drain).toHaveBeenCalledWith([entry('x')], false);
    // A fallback is not a lease, so nothing is released on leave.
    expect(a.stop()).toBe(false);
  });

  it('still reloads on the retry when a takeover drain failed', async () => {
    const session = fakeSession();
    const drain = vi
      .fn<(entries: { id: string }[], acquired: boolean) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Drive down'))
      .mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const a = createNextUpDrainController({
      claim: session.claimFor('a'),
      drain,
      retryMs: 10_000,
    });
    a.onEntries([entry('x')]);
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(drain.mock.calls.map(([, acquired]) => acquired)).toEqual([
      true,
      true,
    ]);
    a.onEntries([entry('y')]);
    await flush();
    expect(drain.mock.calls.at(-1)?.[1]).toBe(false);
    a.stop();
  });

  it('backs off while Drive keeps failing', async () => {
    const session = fakeSession();
    const drain = vi.fn(() => Promise.reject(new Error('Drive down')));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const a = createNextUpDrainController({
      claim: session.claimFor('a'),
      drain,
      retryMs: 10_000,
    });
    a.onEntries([entry('x')]);
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(drain).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(drain).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(drain).toHaveBeenCalledTimes(3);
    a.stop();
  });
});

describe('Next Up tab id', () => {
  it('keeps its id across a reload and hands a duplicated tab a new one', async () => {
    sessionStorage.removeItem('nextUpTabId');
    vi.resetModules();
    const first = await import('./nextUpDrainLease');
    const id = await first.getNextUpTabId();
    expect(sessionStorage.getItem('nextUpTabId')).toBe(id);

    // A duplicated tab copies sessionStorage while the first tab is still open.
    vi.resetModules();
    const duplicate = await import('./nextUpDrainLease');
    const dupId = await duplicate.getNextUpTabId();
    expect(dupId).not.toBe(id);
  });
});

describe('Next Up controller tracking', () => {
  it('reports a successor as live so the old effect keeps the lease', async () => {
    const lease = await import('./nextUpDrainLease');
    const untrackOld = lease.trackNextUpController('s1');
    const untrackNew = lease.trackNextUpController('s1');
    untrackOld();
    expect(lease.nextUpControllerLive('s1')).toBe(true);
    untrackNew();
    expect(lease.nextUpControllerLive('s1')).toBe(false);
  });
});

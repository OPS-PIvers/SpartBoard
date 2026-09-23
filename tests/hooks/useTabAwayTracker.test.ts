import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useTabAwayTracker,
  type UseTabAwayTrackerArgs,
} from '@/hooks/useTabAwayTracker';
import { TAB_EXITS_MAX, type TabExit } from '@/types';

let hasFocus = true;
let visibility: DocumentVisibilityState = 'visible';

function leave() {
  hasFocus = false;
  act(() => {
    window.dispatchEvent(new Event('blur'));
  });
}

function comeBack() {
  hasFocus = true;
  visibility = 'visible';
  act(() => {
    vi.advanceTimersByTime(250);
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function setup(overrides: Partial<UseTabAwayTrackerArgs> = {}) {
  const saveExits = vi.fn<(exits: TabExit[]) => Promise<void>>(() =>
    Promise.resolve()
  );
  const onLeave = vi.fn(() => Promise.resolve(false));
  const onAwayTooLong = vi.fn();
  const base: UseTabAwayTrackerArgs = {
    enabled: true,
    sessionActive: true,
    ready: true,
    serverExits: [],
    attempt: 0,
    getPosition: () => ({ questionIndex: 2 }),
    onLeave,
    saveExits,
    limitMs: null,
    autoSubmit: false,
    onAwayTooLong,
    ...overrides,
  };
  const hook = renderHook(
    (props: UseTabAwayTrackerArgs) => useTabAwayTracker(props),
    { initialProps: base }
  );
  const lastSaved = () => saveExits.mock.calls.at(-1)?.[0] ?? [];
  return { hook, base, saveExits, onLeave, onAwayTooLong, lastSaved };
}

describe('useTabAwayTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
        'performance',
      ],
    });
    vi.setSystemTime(1_000_000);
    hasFocus = true;
    visibility = 'visible';
    vi.spyOn(document, 'hasFocus').mockImplementation(() => hasFocus);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs an open exit on leave and closes it on return', async () => {
    const { hook, onLeave, lastSaved } = setup();
    leave();
    await flush();
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(lastSaved()).toEqual([
      { leftAt: 1_000_000, attempt: 0, questionIndex: 2 },
    ]);
    expect(hook.result.current.away?.outcome).toBeNull();

    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    comeBack();
    const [exit] = lastSaved();
    expect(exit.outcome).toBe('returned');
    expect(exit.durationMs).toBeGreaterThanOrEqual(4_000);
    expect(exit.durationMs).toBeLessThan(4_600);
    expect(exit.returnedAt).toBeGreaterThan(exit.leftAt);
    expect(hook.result.current.away?.outcome).toBe('returned');
  });

  it('closes the exit as auto-submitted when the leave ends the attempt', async () => {
    const { onLeave, lastSaved } = setup();
    onLeave.mockResolvedValueOnce(true);
    leave();
    await flush();
    const [exit] = lastSaved();
    expect(exit.outcome).toBe('auto-submitted');
    expect(exit.returnedAt).toBeUndefined();
  });

  it('submits at the away limit when auto-submit is on', async () => {
    const { onAwayTooLong, lastSaved } = setup({
      limitMs: 10_000,
      autoSubmit: true,
    });
    leave();
    await flush();
    act(() => {
      vi.advanceTimersByTime(9_500);
    });
    expect(onAwayTooLong).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(onAwayTooLong).toHaveBeenCalledTimes(1);
    expect(lastSaved()[0]).toMatchObject({
      durationMs: 10_000,
      outcome: 'auto-submitted',
    });
  });

  it('logs over-limit when the limit passes with auto-submit off', async () => {
    const { onAwayTooLong, lastSaved } = setup({ limitMs: 10_000 });
    leave();
    await flush();
    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    comeBack();
    expect(onAwayTooLong).not.toHaveBeenCalled();
    expect(lastSaved()[0].outcome).toBe('over-limit');
  });

  it('closes an open exit as session-ended when the session stops', async () => {
    const { hook, base, lastSaved } = setup();
    leave();
    await flush();
    hook.rerender({ ...base, enabled: false, sessionActive: false });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(lastSaved()[0].outcome).toBe('session-ended');
  });

  it('does not count a second exit until the warning is released', async () => {
    const { hook, onLeave } = setup();
    leave();
    await flush();
    comeBack();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    leave();
    await flush();
    expect(onLeave).toHaveBeenCalledTimes(1);

    comeBack();
    act(() => hook.result.current.release());
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    leave();
    await flush();
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it('stops appending at the cap but still counts the warning', async () => {
    const full = Array.from({ length: TAB_EXITS_MAX }, (_, i) => ({
      leftAt: i,
      attempt: 0,
      durationMs: 1,
      outcome: 'returned' as const,
    }));
    const { onLeave, saveExits } = setup({ serverExits: full });
    leave();
    await flush();
    comeBack();
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(saveExits).not.toHaveBeenCalled();
  });

  describe('reopen check', () => {
    const stale: TabExit = { leftAt: 1_000_000 - 60_000, attempt: 0 };

    it('submits when an unfinished exit is past the limit', () => {
      const { onAwayTooLong, lastSaved } = setup({
        serverExits: [stale],
        limitMs: 30_000,
        autoSubmit: true,
      });
      expect(onAwayTooLong).toHaveBeenCalledTimes(1);
      expect(lastSaved()[0]).toMatchObject({
        durationMs: 30_000,
        outcome: 'auto-submitted',
      });
    });

    it('closes an unfinished exit as returned when there is no limit', () => {
      const { onAwayTooLong, lastSaved } = setup({ serverExits: [stale] });
      expect(onAwayTooLong).not.toHaveBeenCalled();
      expect(lastSaved()[0]).toMatchObject({
        durationMs: 60_000,
        returnedAt: 1_000_000,
        outcome: 'returned',
      });
    });

    it('never submits a new attempt for an exit from an earlier one', () => {
      const { onAwayTooLong, lastSaved } = setup({
        serverExits: [stale],
        attempt: 1,
        limitMs: 30_000,
        autoSubmit: true,
      });
      expect(onAwayTooLong).not.toHaveBeenCalled();
      expect(lastSaved()[0].outcome).toBe('over-limit');
    });
  });
});

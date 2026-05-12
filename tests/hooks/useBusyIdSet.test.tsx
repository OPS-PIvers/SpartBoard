/**
 * `useBusyIdSet` — contract tests for the shared rapid-click guard
 * extracted from the Phase 5 follow-up duplicate-kebab plumbing.
 *
 * What's pinned:
 *   - `isBusy(id)` is true between `run()` invocation and resolution.
 *   - A second `run(id, …)` while the first is in-flight is a no-op
 *     (returns undefined, does NOT invoke `op`).
 *   - The id is removed in `finally` even when `op` rejects.
 *   - Rejections propagate to the caller of `run`.
 *   - Different ids run independently (no global busy state).
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useBusyIdSet } from '@/hooks/useBusyIdSet';

describe('useBusyIdSet', () => {
  it('flips isBusy(id) to true while op is in-flight and back to false on resolution', async () => {
    const { result } = renderHook(() => useBusyIdSet());
    let resolveOp!: () => void;
    const op = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveOp = resolve;
        })
    );

    let runPromise: Promise<unknown> | undefined;
    act(() => {
      runPromise = result.current.run('a', op);
    });
    expect(op).toHaveBeenCalledOnce();
    expect(result.current.isBusy('a')).toBe(true);
    expect(result.current.isBusy('other')).toBe(false);

    await act(async () => {
      resolveOp();
      await runPromise;
    });
    expect(result.current.isBusy('a')).toBe(false);
  });

  it('rejects a concurrent run(id) call as a no-op (returns undefined, skips op)', async () => {
    const { result } = renderHook(() => useBusyIdSet());
    let resolveFirst!: () => void;
    const first = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = () => resolve('done-1');
        })
    );
    const second = vi.fn().mockResolvedValue('done-2');

    let firstPromise: Promise<unknown> | undefined;
    act(() => {
      firstPromise = result.current.run('a', first);
    });
    expect(first).toHaveBeenCalledOnce();

    // Second call while first is in-flight should be a no-op.
    let secondResult: unknown;
    await act(async () => {
      secondResult = await result.current.run('a', second);
    });
    expect(second).not.toHaveBeenCalled();
    expect(secondResult).toBeUndefined();

    // Drain the first so the test doesn't leak the promise.
    await act(async () => {
      resolveFirst();
      await firstPromise;
    });
    expect(result.current.isBusy('a')).toBe(false);
  });

  it('clears the busy state in finally when op rejects, and rethrows', async () => {
    const { result } = renderHook(() => useBusyIdSet());
    const boom = new Error('boom');
    const op = vi.fn().mockRejectedValue(boom);

    let rejection: unknown;
    await act(async () => {
      try {
        await result.current.run('a', op);
      } catch (err) {
        rejection = err;
      }
    });
    expect(rejection).toBe(boom);
    expect(result.current.isBusy('a')).toBe(false);
  });

  it('tracks different ids independently', async () => {
    const { result } = renderHook(() => useBusyIdSet());
    let resolveA!: () => void;
    let resolveB!: () => void;
    const opA = () =>
      new Promise<void>((resolve) => {
        resolveA = resolve;
      });
    const opB = () =>
      new Promise<void>((resolve) => {
        resolveB = resolve;
      });

    let pA: Promise<unknown> | undefined;
    let pB: Promise<unknown> | undefined;
    act(() => {
      pA = result.current.run('a', opA);
      pB = result.current.run('b', opB);
    });
    expect(result.current.isBusy('a')).toBe(true);
    expect(result.current.isBusy('b')).toBe(true);

    await act(async () => {
      resolveA();
      await pA;
    });
    expect(result.current.isBusy('a')).toBe(false);
    expect(result.current.isBusy('b')).toBe(true);

    await act(async () => {
      resolveB();
      await pB;
    });
    expect(result.current.isBusy('b')).toBe(false);
  });
});

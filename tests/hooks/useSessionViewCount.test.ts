/**
 * Unit tests for `useSessionViewCount`. Mocks Firestore's
 * `getCountFromServer` so the hook is exercised without hitting the
 * emulator. Verifies:
 *   - `enabled === false` short-circuits and does not query.
 *   - Successful counts surface via `count`.
 *   - Concurrent mounts of the same sessionId coalesce onto a single query.
 *   - Subsequent mounts of the same sessionId reuse the cached count.
 *   - `invalidateSessionViewCount` busts the cache and forces a refetch.
 *   - Visibility-driven refresh flushes the cache and re-queries mounted
 *     hooks; the throttle prevents rapid-fire refreshes.
 *   - Changing sessionId mid-lifecycle issues a fresh query for the new key.
 *   - Flipping `enabled` false → true mid-lifecycle issues a query.
 *   - Failed queries soft-fail to `count: 0` rather than rejecting.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const getCountFromServerMock = vi.fn();

// Mock the firestore module before importing the hook so the module-level
// `cache` Map is fresh for every test file run, but shared across tests in
// this file (the cache is intentional production behavior — see hook docs).
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getCountFromServer: (...args: unknown[]): unknown =>
    getCountFromServerMock(...args) as unknown,
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

import {
  _testVisibilityRefresh,
  invalidateSessionViewCount,
  useSessionViewCount,
} from '../../hooks/useSessionViewCount';

afterEach(() => {
  getCountFromServerMock.mockReset();
});

describe('useSessionViewCount', () => {
  it('returns null and does not query when disabled', () => {
    const { result } = renderHook(() =>
      useSessionViewCount('quiz_sessions', 'session-disabled', false)
    );
    expect(result.current).toEqual({ count: null, loading: false });
    expect(getCountFromServerMock).not.toHaveBeenCalled();
  });

  it('returns null and does not query when sessionId is undefined', () => {
    const { result } = renderHook(() =>
      useSessionViewCount('quiz_sessions', undefined, true)
    );
    expect(result.current).toEqual({ count: null, loading: false });
    expect(getCountFromServerMock).not.toHaveBeenCalled();
  });

  it('resolves the count after the aggregation query resolves', async () => {
    getCountFromServerMock.mockResolvedValueOnce({
      data: () => ({ count: 7 }),
    });
    const { result } = renderHook(() =>
      useSessionViewCount('quiz_sessions', 'session-success', true)
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(7);
  });

  it('coalesces concurrent mounts onto a single query', async () => {
    getCountFromServerMock.mockResolvedValueOnce({
      data: () => ({ count: 4 }),
    });
    const sessionId = 'session-coalesce';
    const { result: a } = renderHook(() =>
      useSessionViewCount('mini_app_sessions', sessionId, true)
    );
    const { result: b } = renderHook(() =>
      useSessionViewCount('mini_app_sessions', sessionId, true)
    );
    await waitFor(() => expect(a.current.loading).toBe(false));
    await waitFor(() => expect(b.current.loading).toBe(false));
    expect(a.current.count).toBe(4);
    expect(b.current.count).toBe(4);
    expect(getCountFromServerMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the cached count on a later mount of the same sessionId', async () => {
    getCountFromServerMock.mockResolvedValueOnce({
      data: () => ({ count: 11 }),
    });
    const sessionId = 'session-cache-survival';
    // First mount fetches.
    const first = renderHook(() =>
      useSessionViewCount('quiz_sessions', sessionId, true)
    );
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.count).toBe(11);
    first.unmount();

    // Second mount of the same key should NOT trigger a second query —
    // the module-level cache survives unmount.
    const second = renderHook(() =>
      useSessionViewCount('quiz_sessions', sessionId, true)
    );
    expect(second.result.current).toEqual({ count: 11, loading: false });
    expect(getCountFromServerMock).toHaveBeenCalledTimes(1);
  });

  it('invalidateSessionViewCount drops the cached count and forces a refetch', async () => {
    getCountFromServerMock
      .mockResolvedValueOnce({ data: () => ({ count: 3 }) })
      .mockResolvedValueOnce({ data: () => ({ count: 5 }) });
    const sessionId = 'session-invalidate';
    const first = renderHook(() =>
      useSessionViewCount('mini_app_sessions', sessionId, true)
    );
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.count).toBe(3);
    first.unmount();

    invalidateSessionViewCount('mini_app_sessions', sessionId);

    // Next mount should re-fetch and surface the new count.
    const second = renderHook(() =>
      useSessionViewCount('mini_app_sessions', sessionId, true)
    );
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.count).toBe(5);
    expect(getCountFromServerMock).toHaveBeenCalledTimes(2);
  });

  it('refetches mounted hooks on a visibility refresh and reflects the new count', async () => {
    getCountFromServerMock
      .mockResolvedValueOnce({ data: () => ({ count: 1 }) })
      .mockResolvedValueOnce({ data: () => ({ count: 4 }) });
    const sessionId = 'session-visibility';
    const { result } = renderHook(() =>
      useSessionViewCount('quiz_sessions', sessionId, true)
    );
    await waitFor(() => expect(result.current.count).toBe(1));

    // Simulate "teacher returns to the SpartBoard tab" — fire a visibility
    // refresh well past the throttle window. The mounted hook should
    // observe the new count without remount. `act` wraps the synchronous
    // setRevision bumps the refresh triggers across subscribed hooks.
    let fired = false;
    act(() => {
      fired = _testVisibilityRefresh(Date.now() + 10_000);
    });
    expect(fired).toBe(true);

    await waitFor(() => expect(result.current.count).toBe(4));
    expect(getCountFromServerMock).toHaveBeenCalledTimes(2);
  });

  it('throttles back-to-back visibility refreshes', async () => {
    // The first fired refresh clears the cache and forces a refetch — so
    // we mock two responses (initial mount + first refresh's refetch).
    // The second refresh's no-op behaviour is what we're asserting.
    getCountFromServerMock
      .mockResolvedValueOnce({ data: () => ({ count: 9 }) })
      .mockResolvedValueOnce({ data: () => ({ count: 9 }) });
    const sessionId = 'session-throttle';
    const { result } = renderHook(() =>
      useSessionViewCount('quiz_sessions', sessionId, true)
    );
    await waitFor(() => expect(result.current.count).toBe(9));

    // Two rapid refreshes inside the 5s throttle window: first wins,
    // second is a no-op.
    const t0 = Date.now() + 20_000;
    let firstFired = false;
    let secondFired = false;
    act(() => {
      firstFired = _testVisibilityRefresh(t0);
      secondFired = _testVisibilityRefresh(t0 + 100);
    });

    expect(firstFired).toBe(true);
    expect(secondFired).toBe(false);
    // Total Firestore reads: initial mount + the first (un-throttled)
    // visibility refresh. The throttled second refresh adds nothing.
    await waitFor(() =>
      expect(getCountFromServerMock).toHaveBeenCalledTimes(2)
    );
  });

  it('issues a fresh query when sessionId changes mid-lifecycle', async () => {
    getCountFromServerMock
      .mockResolvedValueOnce({ data: () => ({ count: 2 }) })
      .mockResolvedValueOnce({ data: () => ({ count: 8 }) });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useSessionViewCount('quiz_sessions', id, true),
      { initialProps: { id: 'session-A' } }
    );
    await waitFor(() => expect(result.current.count).toBe(2));

    rerender({ id: 'session-B' });
    await waitFor(() => expect(result.current.count).toBe(8));
    expect(getCountFromServerMock).toHaveBeenCalledTimes(2);
  });

  it('issues a query when enabled flips false → true', async () => {
    getCountFromServerMock.mockResolvedValueOnce({
      data: () => ({ count: 6 }),
    });
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSessionViewCount('quiz_sessions', 'session-toggle', enabled),
      { initialProps: { enabled: false } }
    );
    expect(result.current).toEqual({ count: null, loading: false });
    expect(getCountFromServerMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.count).toBe(6));
    expect(getCountFromServerMock).toHaveBeenCalledTimes(1);
  });

  it('soft-fails to 0 when the query rejects', async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation((): void => undefined);
    getCountFromServerMock.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() =>
      useSessionViewCount('guided_learning_sessions', 'session-failure', true)
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      '[useSessionViewCount] count query failed',
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });
});

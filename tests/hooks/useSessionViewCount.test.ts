/**
 * Unit tests for `useSessionViewCount`. Mocks Firestore's
 * `getCountFromServer` so the hook is exercised without hitting the
 * emulator. Verifies:
 *   - `enabled === false` short-circuits and does not query.
 *   - Successful counts surface via `count`.
 *   - Concurrent mounts of the same sessionId coalesce onto a single query.
 *   - Failed queries soft-fail to `count: 0` rather than rejecting.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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

import { useSessionViewCount } from '../../hooks/useSessionViewCount';

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

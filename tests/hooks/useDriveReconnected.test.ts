/**
 * Tests for `useDriveReconnected`.
 *
 * The hook is small but load-bearing: every widget that registers a refetch
 * via this hook depends on the ref-pinned callback pattern — a regression to
 * a stale-closure variant would silently break post-reconnect refresh and
 * leave dashboards stuck on whatever they last managed to load.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDriveReconnected } from '@/hooks/useDriveReconnected';
import {
  notifyDriveReconnected,
  __resetDriveAuthErrorsForTests,
} from '@/utils/driveAuthErrors';

beforeEach(() => {
  __resetDriveAuthErrorsForTests();
});

describe('useDriveReconnected', () => {
  it('invokes the callback when notifyDriveReconnected fires', () => {
    const cb = vi.fn();
    renderHook(() => useDriveReconnected(cb));
    expect(cb).not.toHaveBeenCalled();
    act(() => {
      notifyDriveReconnected();
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount — no callback after unmount', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useDriveReconnected(cb));
    unmount();
    act(() => {
      notifyDriveReconnected();
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires the LATEST callback on re-render — the ref pattern is load-bearing', () => {
    // Without the ref pinning, a re-render with a new callback closure
    // would still invoke the original closure on the next notify (because
    // subscribeDriveReconnected captured `callback` at subscribe time).
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useDriveReconnected(cb),
      { initialProps: { cb: first } }
    );
    rerender({ cb: second });
    act(() => {
      notifyDriveReconnected();
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('only registers one subscription regardless of re-render count', () => {
    const cb = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useDriveReconnected(cb),
      { initialProps: { cb } }
    );
    for (let i = 0; i < 5; i++) {
      rerender({ cb });
    }
    act(() => {
      notifyDriveReconnected();
    });
    // Even though we re-rendered 6 times total, the callback should fire
    // exactly once — one subscription per consumer.
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('supports multiple independent subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    renderHook(() => useDriveReconnected(a));
    renderHook(() => useDriveReconnected(b));
    act(() => {
      notifyDriveReconnected();
    });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

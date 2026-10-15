import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  endTourFrame,
  getTourFrame,
  startTourFrame,
  useDockPosition,
  useTourFrameHold,
} from './tourFrame';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ dockPosition: 'right' }),
}));

const opts = { dockItemTypes: [], quickAccess: [false, false] as const };

afterEach(() => endTourFrame());

describe('useTourFrameHold', () => {
  it('closes on every start, and restores the first start on end', () => {
    const restores: number[] = [];
    let holds = 0;
    renderHook(() =>
      useTourFrameHold(() => {
        holds += 1;
        const n = holds;
        return () => restores.push(n);
      })
    );
    expect(holds).toBe(0);
    act(() => startTourFrame(opts));
    act(() => startTourFrame(opts));
    act(() => startTourFrame(opts));
    expect(holds).toBe(3);
    act(() => endTourFrame());
    expect(restores).toEqual([1]);
    expect(getTourFrame().active).toBe(false);
    act(() => endTourFrame());
    expect(restores).toEqual([1]);
  });

  it('holds a surface that mounts mid-tour and restores it when it unmounts', () => {
    act(() => startTourFrame(opts));
    const restore = vi.fn();
    const { unmount } = renderHook(() => useTourFrameHold(() => restore));
    unmount();
    expect(restore).toHaveBeenCalledTimes(1);
  });
});

describe('useDockPosition', () => {
  it('is bottom only while a tour runs', () => {
    const { result } = renderHook(() => useDockPosition());
    expect(result.current).toBe('right');
    act(() => startTourFrame(opts));
    expect(result.current).toBe('bottom');
    act(() => endTourFrame());
    expect(result.current).toBe('right');
  });
});

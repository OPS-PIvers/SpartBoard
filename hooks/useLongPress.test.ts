import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useLongPress } from './useLongPress';

const fakePointerEvent = (x = 0, y = 0) =>
  ({ clientX: x, clientY: y }) as unknown as React.PointerEvent;

describe('useLongPress', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onLongPress after the hold delay while still mounted', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(fakePointerEvent());
    vi.advanceTimersByTime(600);

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending timer when the pointer moves past the threshold', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(fakePointerEvent(0, 0));
    result.current.onPointerMove(fakePointerEvent(50, 50));
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels the pending timer on pointer up', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(fakePointerEvent());
    result.current.onPointerUp();
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not fire onLongPress after the owning component unmounts mid-press', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result, unmount } = renderHook(() => useLongPress(onLongPress));

    result.current.onPointerDown(fakePointerEvent());
    unmount();
    vi.advanceTimersByTime(600);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});

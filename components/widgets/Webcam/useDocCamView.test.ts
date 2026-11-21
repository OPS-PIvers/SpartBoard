import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDocCamView } from './useDocCamView';

class RO {
  observe = vi.fn();
  disconnect = vi.fn();
}

describe('useDocCamView pending save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', RO);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('saves a wheel zoom that is still debounced when the widget unmounts', () => {
    const onSave = vi.fn<(p: { zoomLevel: number }) => void>();
    const { result, unmount } = renderHook(() =>
      useDocCamView({
        enabled: true,
        savedZoom: 1,
        savedRotation: 0,
        onSave,
      })
    );
    const feed = document.createElement('div');
    act(() => result.current.attachFeed(feed));
    act(() => {
      feed.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -100, cancelable: true })
      );
    });
    expect(onSave).not.toHaveBeenCalled();
    unmount();
    vi.advanceTimersByTime(1000);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].zoomLevel).toBeGreaterThan(1);
  });
});

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWindowSize, windowSizeStore } from './useWindowSize';

describe('useWindowSize', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    // Reset window size before each test
    window.innerWidth = 1024;
    window.innerHeight = 768;
    windowSizeStore.listeners.clear();
    windowSizeStore.snapshot = { width: 1024, height: 768 };
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    window.innerHeight = originalInnerHeight;
    vi.restoreAllMocks();
  });

  it('should return the current window size initially', () => {
    const { result } = renderHook(() => useWindowSize());
    expect(result.current.width).toBe(1024);
    expect(result.current.height).toBe(768);
  });

  it('should update size when window is resized and enabled (default)', () => {
    const { result } = renderHook(() => useWindowSize());

    act(() => {
      window.innerWidth = 500;
      window.innerHeight = 500;
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.width).toBe(500);
    expect(result.current.height).toBe(500);
  });

  it('should cleanup event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useWindowSize());

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'resize',
      expect.any(Function)
    );
  });

  it('should NOT update size when disabled even if a re-render occurs', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useWindowSize(enabled),
      {
        initialProps: { enabled: false },
      }
    );

    act(() => {
      window.innerWidth = 500;
      window.innerHeight = 500;
      window.dispatchEvent(new Event('resize'));
    });

    // Force a re-render while still disabled to ensure getSnapshot handles it properly
    rerender({ enabled: false });

    // Should remain at initial size because the hook instance has a frozen ref
    expect(result.current.width).toBe(1024);
    expect(result.current.height).toBe(768);
  });

  it('should attach listener when enabled becomes true', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const { rerender } = renderHook(({ enabled }) => useWindowSize(enabled), {
      initialProps: { enabled: false },
    });

    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      'resize',
      expect.any(Function)
    );

    // Enable
    rerender({ enabled: true });

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'resize',
      expect.any(Function)
    );
  });

  it('should update immediately when enabled is toggled to true', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useWindowSize(enabled),
      {
        initialProps: { enabled: false },
      }
    );

    // Resize while disabled
    act(() => {
      window.innerWidth = 500;
      window.innerHeight = 500;
      // In a real browser, the window dimensions might change but we don't dispatch an event,
      // or we do dispatch an event.
      // useSyncExternalStore will pull the latest snapshot when it re-subscribes or re-renders.
    });

    // Enable it
    rerender({ enabled: true });

    // Should sync to current window size immediately since getSnapshot will pull the new values.
    expect(result.current.width).toBe(500);
    expect(result.current.height).toBe(500);
  });
});

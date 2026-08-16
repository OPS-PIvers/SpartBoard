/**
 * useGlobalStyleEditor — regression coverage for the board-switch-mid-drag
 * race. See hooks/useGlobalStyleEditor.ts for the full mechanism writeup.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_GLOBAL_STYLE } from '@/types';

const setGlobalStyle = vi.fn();
const addToast = vi.fn();

interface MockDashboardState {
  activeDashboard: { id: string; globalStyle: typeof DEFAULT_GLOBAL_STYLE };
  setGlobalStyle: typeof setGlobalStyle;
  isActiveBoardReadOnly: boolean;
  addToast: typeof addToast;
}

const mockState: MockDashboardState = {
  activeDashboard: {
    id: 'board-a',
    globalStyle: { ...DEFAULT_GLOBAL_STYLE, windowTransparency: 0.2 },
  },
  setGlobalStyle,
  isActiveBoardReadOnly: false,
  addToast,
};

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => mockState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _k,
  }),
}));

import { useGlobalStyleEditor } from '@/hooks/useGlobalStyleEditor';

describe('useGlobalStyleEditor — board switch mid-drag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setGlobalStyle.mockClear();
    mockState.activeDashboard = {
      id: 'board-a',
      globalStyle: { ...DEFAULT_GLOBAL_STYLE, windowTransparency: 0.2 },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not write a stale dragged value onto a different board switched to before the debounce fires', () => {
    const { result, rerender } = renderHook(() => useGlobalStyleEditor());

    // Drag the windowTransparency slider on board-a. The debounced commit is
    // now armed to fire in 200ms with value 0.5.
    act(() => {
      result.current.windowTransparency.onChange(0.5);
    });
    expect(result.current.windowTransparency.value).toBe(0.5);

    // Board switches to board-b (e.g. via a keyboard shortcut) before the
    // debounce fires. board-b's own committed transparency is 0.9.
    mockState.activeDashboard = {
      id: 'board-b',
      globalStyle: { ...DEFAULT_GLOBAL_STYLE, windowTransparency: 0.9 },
    };
    rerender();

    // The slider must reflect board-b's real value, not the stale in-flight
    // drag value carried over from board-a.
    expect(result.current.windowTransparency.value).toBe(0.9);

    // Let the originally-armed debounce fire.
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // The debounced commit from board-a's drag must NOT land on board-b.
    expect(setGlobalStyle).not.toHaveBeenCalledWith({
      windowTransparency: 0.5,
    });
  });

  it('applies the same board-switch guard to dockTransparency', () => {
    mockState.activeDashboard = {
      id: 'board-a',
      globalStyle: { ...DEFAULT_GLOBAL_STYLE, dockTransparency: 0.2 },
    };
    const { result, rerender } = renderHook(() => useGlobalStyleEditor());

    act(() => {
      result.current.dockTransparency.onChange(0.5);
    });
    expect(result.current.dockTransparency.value).toBe(0.5);

    mockState.activeDashboard = {
      id: 'board-b',
      globalStyle: { ...DEFAULT_GLOBAL_STYLE, dockTransparency: 0.9 },
    };
    rerender();

    expect(result.current.dockTransparency.value).toBe(0.9);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(setGlobalStyle).not.toHaveBeenCalledWith({ dockTransparency: 0.5 });
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetData } from '@/types';

const { mockClose, state } = vi.hoisted(() => {
  const board: {
    current: { shareId: string | null; widgets: Partial<WidgetData>[] };
  } = { current: { shareId: null, widgets: [] } };
  return { mockClose: vi.fn(), state: board };
});

vi.mock('@/utils/activityWallBoardAccess', () => ({
  closeWallsToBoard: mockClose,
}));

vi.mock('@/context/dashboardCanvasStore', () => ({
  useActiveBoardLinkedShareId: () => state.current.shareId,
  useDashboardCanvasSelector: <T>(
    selector: (s: { activeDashboard: { widgets: unknown[] } }) => T
  ) => selector({ activeDashboard: { widgets: state.current.widgets } }),
}));

import { useWallBoardAccessCleanup } from './useWallBoardAccessCleanup';

const wall = (id: string, activeActivityId?: string): Partial<WidgetData> => ({
  id,
  type: 'activity-wall',
  config: activeActivityId ? { activeActivityId } : {},
});

beforeEach(() => {
  vi.useFakeTimers();
  mockClose.mockResolvedValue(undefined);
  state.current = { shareId: 'share-1', widgets: [] };
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useWallBoardAccessCleanup', () => {
  it('keeps every wall any widget on the board still shows', async () => {
    state.current.widgets = [
      wall('w1', 'wall-a'),
      wall('w2', 'wall-a'),
      wall('w3', 'wall-b'),
      wall('w4'),
      { id: 'n1', type: 'clock', config: {} },
    ];
    renderHook(() => useWallBoardAccessCleanup('teacher-1'));
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(mockClose).toHaveBeenCalledWith(
      'teacher-1',
      'share-1',
      new Set(['wall-a', 'wall-b'])
    );
  });

  it('runs again once a widget showing a wall is removed', async () => {
    state.current.widgets = [wall('w1', 'wall-a'), wall('w2', 'wall-b')];
    const { rerender } = renderHook(() =>
      useWallBoardAccessCleanup('teacher-1')
    );
    await act(() => vi.advanceTimersByTimeAsync(3000));
    state.current.widgets = [wall('w1', 'wall-a')];
    rerender();
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(mockClose).toHaveBeenLastCalledWith(
      'teacher-1',
      'share-1',
      new Set(['wall-a'])
    );
  });

  it('does nothing off a shared board or without a teacher', async () => {
    state.current.shareId = null;
    renderHook(() => useWallBoardAccessCleanup('teacher-1'));
    state.current.shareId = 'share-1';
    renderHook(() => useWallBoardAccessCleanup(null));
    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(mockClose).not.toHaveBeenCalled();
  });
});

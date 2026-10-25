import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  addSample,
  useNoiseSession,
  type NoiseSession,
} from './useNoiseSession';

describe('addSample', () => {
  it('counts seconds per level and merges runs at the same level', () => {
    let session: NoiseSession = {
      seconds: [0, 0, 0, 0, 0],
      runs: [],
      alerts: 0,
    };
    for (const level of [0, 0, 2, 2, 2, 0]) session = addSample(session, level);
    expect(session.seconds).toEqual([3, 0, 3, 0, 0]);
    expect(session.runs).toEqual([
      { level: 0, seconds: 2 },
      { level: 2, seconds: 3 },
      { level: 0, seconds: 1 },
    ]);
  });
});

describe('useNoiseSession', () => {
  it('records nothing while the tab is hidden', () => {
    vi.useFakeTimers();
    const state = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible');
    const { result } = renderHook(() => useNoiseSession(true, 2));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    state.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.session.seconds[2]).toBe(3);
    state.mockRestore();
    vi.useRealTimers();
  });
});

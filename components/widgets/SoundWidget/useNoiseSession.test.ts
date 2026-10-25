import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  addSample,
  MAX_RUNS,
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

describe('addSample timeline', () => {
  const empty = (): NoiseSession => ({
    seconds: [0, 0, 0, 0, 0],
    runs: [],
    alerts: 0,
  });

  it('folds a short blip back into the stretch around it', () => {
    let session = empty();
    for (const level of [1, 1, 1, 2, 1]) session = addSample(session, level);
    expect(session.runs).toEqual([{ level: 1, seconds: 5 }]);
    expect(session.seconds).toEqual([0, 4, 1, 0, 0]);
  });

  it('stays bounded when the level keeps changing', () => {
    let session = empty();
    for (let i = 0; i < 5000; i++)
      session = addSample(session, (i / 3) % 2 < 1 ? 0 : 3);
    expect(session.runs.length).toBeLessThanOrEqual(MAX_RUNS);
    const total = session.runs.reduce((sum, run) => sum + run.seconds, 0);
    expect(total).toBe(5000);
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

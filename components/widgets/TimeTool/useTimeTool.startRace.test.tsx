import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeTool } from './useTimeTool';
import { useDashboard } from '@/context/useDashboard';
import { resumeAudio } from '@/utils/timeToolAudio';
import { WidgetData, TimeToolConfig, DEFAULT_GLOBAL_STYLE } from '@/types';

vi.mock('@/context/useDashboard');
vi.mock('@/utils/timeToolAudio', () => ({
  playTimerAlert: vi.fn(),
  resumeAudio: vi.fn(),
}));

const make = (config: Partial<TimeToolConfig>): WidgetData => ({
  id: 't1',
  type: 'time-tool',
  x: 0,
  y: 0,
  w: 400,
  h: 400,
  z: 1,
  flipped: false,
  config: {
    mode: 'timer',
    visualType: 'digital',
    duration: 300,
    elapsedTime: 300,
    isRunning: false,
    selectedSound: 'Chime',
    ...config,
  },
});

describe('useTimeTool handleStart', () => {
  it('does not start from a stale config when the timer changed while audio resumed', async () => {
    const updateWidget = vi.fn();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: { widgets: [], globalStyle: DEFAULT_GLOBAL_STYLE },
      dashboards: [],
      updateWidget,
    });
    let release: () => void = () => undefined;
    (resumeAudio as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      })
    );

    const { result, rerender } = renderHook(({ w }) => useTimeTool(w), {
      initialProps: { w: make({}) },
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleStart();
    });
    // A remote started the timer while the audio context was resuming.
    rerender({
      w: make({ isRunning: true, startTime: 1000, elapsedTime: 250 }),
    });
    await act(async () => {
      release();
      await pending;
    });

    expect(updateWidget).not.toHaveBeenCalled();
  });
});

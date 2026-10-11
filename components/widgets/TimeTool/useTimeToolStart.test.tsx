import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeTool } from './useTimeTool';
import { useDashboard } from '@/context/useDashboard';
import { resumeAudio } from '@/utils/timeToolAudio';
import { WidgetData, TimeToolConfig } from '@/types';

vi.mock('@/context/useDashboard');
vi.mock('@/utils/timeToolAudio', () => ({
  playTimerAlert: vi.fn(),
  resumeAudio: vi.fn(),
}));

const baseConfig: TimeToolConfig = {
  mode: 'timer',
  visualType: 'digital',
  duration: 300,
  elapsedTime: 300,
  isRunning: false,
  startTime: null,
  selectedSound: 'Gong',
};

const makeWidget = (config: TimeToolConfig): WidgetData =>
  ({
    id: 'tt-1',
    type: 'time-tool',
    x: 0,
    y: 0,
    w: 400,
    h: 400,
    z: 1,
    flipped: false,
    config,
  }) as WidgetData;

describe('useTimeTool handleStart', () => {
  it('does not overwrite config changed while audio resumes', async () => {
    let release!: () => void;
    vi.mocked(resumeAudio).mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      })
    );
    const updateWidget =
      vi.fn<(id: string, u: { config: Partial<TimeToolConfig> }) => void>();
    vi.mocked(useDashboard).mockReturnValue({
      activeDashboard: { widgets: [], globalStyle: {} },
      updateWidget,
    } as unknown as ReturnType<typeof useDashboard>);

    const { result, rerender } = renderHook(({ w }) => useTimeTool(w), {
      initialProps: { w: makeWidget(baseConfig) },
    });

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleStart();
    });

    const live: TimeToolConfig = { ...baseConfig, selectedSound: 'Chime' };
    rerender({ w: makeWidget(live) });

    release();
    await act(async () => {
      await pending;
    });

    const sent = updateWidget.mock.calls[0][1].config;
    const merged = { ...live, ...sent };
    expect(merged.selectedSound).toBe('Chime');
    expect(merged.isRunning).toBe(true);
  });
});

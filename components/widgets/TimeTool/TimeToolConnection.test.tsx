import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeTool } from './useTimeTool';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  TimeToolConfig,
  TrafficConfig,
  ExpectationsConfig,
  DEFAULT_GLOBAL_STYLE,
} from '@/types';

vi.mock('@/context/useDashboard');
vi.mock('@/utils/timeToolAudio', () => ({
  playTimerAlert: vi.fn(),
  resumeAudio: vi.fn().mockResolvedValue(undefined),
}));

const mockUpdateWidget = vi.fn();
const mockTrafficWidget: WidgetData = {
  id: 'traffic-1',
  type: 'traffic',
  x: 0,
  y: 0,
  w: 2,
  h: 2,
  z: 1,
  flipped: false,
  config: { active: 'green' } as TrafficConfig,
};

const mockDashboardContext = {
  activeDashboard: {
    widgets: [mockTrafficWidget],
    globalStyle: DEFAULT_GLOBAL_STYLE,
  },
  updateWidget: mockUpdateWidget,
};

describe('useTimeTool Connection (Nexus)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const createWidget = (config: Partial<TimeToolConfig> = {}): WidgetData => {
    return {
      id: 'timetool-1',
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
        duration: 5,
        elapsedTime: 5,
        isRunning: false,
        selectedSound: 'Chime',
        ...config,
      },
    } as WidgetData;
  };

  it('updates traffic light to RED when timer ends', () => {
    const widget = createWidget({
      isRunning: true,
      startTime: Date.now(),
      timerEndTrafficColor: 'red',
    });

    renderHook(() => useTimeTool(widget));

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'traffic-1',

      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          active: 'red',
        }),
      })
    );
  });

  it('updates traffic light to YELLOW when timer ends', () => {
    const widget = createWidget({
      isRunning: true,
      startTime: Date.now(),
      timerEndTrafficColor: 'yellow',
    });

    renderHook(() => useTimeTool(widget));

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'traffic-1',

      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({
          active: 'yellow',
        }),
      })
    );
  });

  it('does NOT update traffic light if timerEndTrafficColor is NULL', () => {
    const widget = createWidget({
      isRunning: true,
      startTime: Date.now(),
      timerEndTrafficColor: null,
    });

    renderHook(() => useTimeTool(widget));

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // Should call updateWidget to stop the timer, but NOT for the traffic light
    expect(mockUpdateWidget).not.toHaveBeenCalledWith(
      'traffic-1',
      expect.anything()
    );
  });

  it('handles missing traffic light widget gracefully', () => {
    // Override context to have NO widgets
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      activeDashboard: {
        ...mockDashboardContext.activeDashboard,
        widgets: [],
      },
    });

    const widget = createWidget({
      isRunning: true,
      startTime: Date.now(),
      timerEndTrafficColor: 'red',
    });

    renderHook(() => useTimeTool(widget));

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // Should run without error, but updateWidget should NOT be called for any traffic light
    expect(mockUpdateWidget).not.toHaveBeenCalledWith(
      expect.stringMatching(/^traffic/),
      expect.anything()
    );
  });

  // Regression test for the dashboard-churn perf bug.
  //
  // The RAF tick loop used to depend on `activeDashboard` (and every
  // `timerEnd*` config field) so it could read those at firing time. But
  // `activeDashboard` is a fresh reference on every dashboard mutation —
  // ANY widget add/remove/edit/drag-end. With the dependency in place the
  // running timer would cancel and re-schedule its RAF on every unrelated
  // dashboard change, which adds up fast when a position-aware widget
  // (catalyst*) is being dragged at 60fps. The fix routes trigger-time
  // state through a ref so the RAF loop only restarts when the timer's
  // own run state changes.
  it('does NOT cancel/re-schedule its RAF when unrelated dashboard state changes', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

    try {
      const initialDashboard = {
        widgets: [mockTrafficWidget],
        globalStyle: DEFAULT_GLOBAL_STYLE,
      };
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: initialDashboard,
        updateWidget: mockUpdateWidget,
      });

      const widget = createWidget({
        isRunning: true,
        startTime: Date.now(),
        timerEndTrafficColor: 'red',
      });

      const { rerender } = renderHook(({ w }) => useTimeTool(w), {
        initialProps: { w: widget },
      });

      const rafCallsAtStart = rafSpy.mock.calls.length;
      const cancelCallsAtStart = cancelSpy.mock.calls.length;

      // Simulate a dashboard mutation on an unrelated widget (e.g. a
      // catalyst tile being dragged, or the teacher editing a different
      // widget's settings). The widgets array is rebuilt with the same
      // content but a fresh object reference, just like
      // DashboardContext does on every `setDashboards` call.
      for (let i = 0; i < 5; i++) {
        (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
          activeDashboard: {
            widgets: [{ ...mockTrafficWidget }],
            globalStyle: DEFAULT_GLOBAL_STYLE,
          },
          updateWidget: mockUpdateWidget,
        });
        rerender({ w: widget });
      }

      // The timer is still running with the exact same timing state — no
      // new RAF should have been scheduled and the existing one should
      // not have been cancelled.
      expect(rafSpy.mock.calls.length).toBe(rafCallsAtStart);
      expect(cancelSpy.mock.calls.length).toBe(cancelCallsAtStart);
    } finally {
      // Restore the spies so the next test's fake-timer RAF shim isn't
      // hidden by a leftover spy wrapper.
      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    }
  });

  // The ref-based approach has to keep working even when the relevant
  // values change after the timer started. This verifies the auto-trigger
  // reads the LATEST settings/widget set at firing time (not whatever was
  // captured when the RAF was first scheduled).
  it('uses the latest timerEndVoiceLevel and widget set at expiry, even when changed mid-run', () => {
    const expectationsWidget: WidgetData = {
      id: 'expectations-1',
      type: 'expectations',
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      z: 1,
      flipped: false,
      config: { voiceLevel: 0 } as ExpectationsConfig,
    };

    // Start with the expectations widget present but no end-trigger set.
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeDashboard: {
        widgets: [expectationsWidget],
        globalStyle: DEFAULT_GLOBAL_STYLE,
      },
      updateWidget: mockUpdateWidget,
    });

    const startTime = Date.now();
    const initialWidget = createWidget({
      isRunning: true,
      startTime,
      timerEndVoiceLevel: null,
    });

    const { rerender } = renderHook(({ w }) => useTimeTool(w), {
      initialProps: { w: initialWidget },
    });

    // Mid-countdown, the teacher decides they want voice level 2 at expiry.
    const updatedWidget = createWidget({
      isRunning: true,
      startTime,
      timerEndVoiceLevel: 2,
    });
    rerender({ w: updatedWidget });

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'expectations-1',
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: expect.objectContaining({ voiceLevel: 2 }),
      })
    );
  });
});

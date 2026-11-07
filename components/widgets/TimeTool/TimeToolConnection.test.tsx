import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeTool } from './useTimeTool';
import { useDashboard } from '@/context/useDashboard';
import { playTimerAlert } from '@/utils/timeToolAudio';
import { WidgetData, TimeToolConfig, DEFAULT_GLOBAL_STYLE } from '@/types';

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
  config: { active: 'green' },
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
    };
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
      }),
      { skipHistory: true }
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
      }),
      { skipHistory: true }
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
    expect(mockUpdateWidget.mock.calls.some((c) => c[0] === 'traffic-1')).toBe(
      false
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
    expect(
      mockUpdateWidget.mock.calls.some((c) => /^traffic/.test(String(c[0])))
    ).toBe(false);
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
      config: { voiceLevel: 0 },
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
      }),
      { skipHistory: true }
    );
  });

  it('leaves the shown board alone when the timer is on a hidden board', () => {
    const widget = createWidget({
      isRunning: true,
      startTime: Date.now(),
      timerEndTrafficColor: 'red',
    });

    renderHook(() => useTimeTool(widget, { isBoardActive: false }));

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(playTimerAlert).toHaveBeenCalled();
    expect(mockUpdateWidget).not.toHaveBeenCalledWith(
      'traffic-1',
      expect.anything(),
      expect.anything()
    );
  });

  it('does not act later when its board is shown again', () => {
    const widget = createWidget({
      isRunning: true,
      startTime: Date.now(),
      timerEndTrafficColor: 'red',
    });

    const { rerender } = renderHook(
      ({ active }) => useTimeTool(widget, { isBoardActive: active }),
      { initialProps: { active: false } }
    );

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    rerender({ active: true });

    expect(mockUpdateWidget).not.toHaveBeenCalledWith(
      'traffic-1',
      expect.anything(),
      expect.anything()
    );
  });
  describe('end-of-timer triggers', () => {
    const sisters = (config: Record<string, unknown> = {}): WidgetData[] =>
      (['random', 'nextUp', 'stations'] as const).map((type) => ({
        id: `${type}-1`,
        type,
        x: 0,
        y: 0,
        w: 2,
        h: 2,
        z: 1,
        flipped: false,
        config: { ...config },
      }));
    const onAll = {
      timerEndTriggerRandom: true,
      timerEndTriggerNextUp: true,
      timerEndTriggerStationsRotate: true,
    };
    const triggerWrites = (calls: unknown[][]) =>
      calls
        .filter(([id]) => /^(random|nextUp|stations)-1$/.test(String(id)))
        .map(([id, u]) => [id, (u as { config: unknown }).config]);

    it('writes the run end time, so every device showing the timer writes the same trigger', () => {
      const startTime = Date.now();
      const widget = createWidget({ isRunning: true, startTime, ...onAll });
      const endAt = startTime + 5000;
      const device = (lateMs: number) => {
        const updateWidget = vi.fn();
        (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
          activeDashboard: { widgets: sisters() },
          updateWidget,
        });
        const { unmount } = renderHook(() => useTimeTool(widget));
        act(() => {
          vi.advanceTimersByTime(lateMs);
        });
        unmount();
        return updateWidget;
      };
      // The projector's frame lands later than the laptop's; both write the same value.
      const laptop = device(5100);
      const projector = device(700);

      const expected = [
        ['random-1', { externalTrigger: endAt }],
        ['nextUp-1', { externalTrigger: endAt }],
        ['stations-1', { rotationTrigger: endAt }],
      ];
      expect(triggerWrites(laptop.mock.calls)).toEqual(expected);
      expect(triggerWrites(projector.mock.calls)).toEqual(expected);
    });

    it('skips a trigger another device already wrote for this run', () => {
      const startTime = Date.now();
      const widget = createWidget({ isRunning: true, startTime, ...onAll });
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: {
          widgets: sisters({
            externalTrigger: startTime + 5000,
            rotationTrigger: startTime + 5000,
          }),
        },
        updateWidget: mockUpdateWidget,
      });
      renderHook(() => useTimeTool(widget));

      act(() => {
        vi.advanceTimersByTime(6000);
      });

      expect(triggerWrites(mockUpdateWidget.mock.calls)).toEqual([]);
    });

    it('still fires after an older trigger, with the same skipHistory write as before', () => {
      const startTime = Date.now();
      const widget = createWidget({ isRunning: true, startTime, ...onAll });
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        activeDashboard: {
          widgets: sisters({ externalTrigger: 10, rotationTrigger: 10 }),
        },
        updateWidget: mockUpdateWidget,
      });
      renderHook(() => useTimeTool(widget));

      act(() => {
        vi.advanceTimersByTime(6000);
      });

      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'random-1',
        { config: { externalTrigger: startTime + 5000 } },
        { skipHistory: true }
      );
      expect(triggerWrites(mockUpdateWidget.mock.calls)).toHaveLength(3);
    });
  });

  describe('expiry write', () => {
    it('saves the expiry on the shown board through updateWidget', () => {
      const applyConnectionChanges = vi.fn();
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockDashboardContext,
        applyConnectionChanges,
      });
      const widget = createWidget({ isRunning: true, startTime: Date.now() });
      renderHook(() => useTimeTool(widget));

      act(() => {
        vi.advanceTimersByTime(6000);
      });

      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'timetool-1',
        { config: { isRunning: false, elapsedTime: 0, startTime: null } },
        { skipHistory: true }
      );
      expect(applyConnectionChanges).not.toHaveBeenCalled();
    });

    it("saves a hidden board's expiry to that board, so it doesn't stay running at 0", () => {
      const applyConnectionChanges = vi.fn();
      const widget = createWidget({ isRunning: true, startTime: Date.now() });
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockDashboardContext,
        dashboards: [
          { id: 'shown', widgets: [mockTrafficWidget] },
          { id: 'hidden', widgets: [widget] },
        ],
        applyConnectionChanges,
      });
      renderHook(() => useTimeTool(widget, { isBoardActive: false }));

      act(() => {
        vi.advanceTimersByTime(6000);
      });

      expect(applyConnectionChanges).toHaveBeenCalledWith('hidden', {
        'timetool-1': { isRunning: false, elapsedTime: 0, startTime: null },
      });
      expect(mockUpdateWidget).not.toHaveBeenCalledWith(
        'timetool-1',
        expect.anything(),
        expect.anything()
      );
    });

    it("leaves a view-only board's hidden timer alone", () => {
      const applyConnectionChanges = vi.fn();
      const widget = createWidget({ isRunning: true, startTime: Date.now() });
      (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        ...mockDashboardContext,
        dashboards: [
          { id: 'hidden', linkedShareRole: 'viewer', widgets: [widget] },
        ],
        applyConnectionChanges,
      });
      renderHook(() => useTimeTool(widget, { isBoardActive: false }));

      act(() => {
        vi.advanceTimersByTime(6000);
      });

      expect(applyConnectionChanges).not.toHaveBeenCalled();
    });
  });
});

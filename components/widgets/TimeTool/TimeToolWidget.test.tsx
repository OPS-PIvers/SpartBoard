import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, TimeToolConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { TimeToolWidget } from './TimeToolWidget';
import { DashboardContextValue } from '@/context/DashboardContextValue';

vi.mock('@/context/useDashboard');
vi.mock('@/utils/timeToolAudio', () => ({
  playTimerAlert: vi.fn(),
  resumeAudio: vi.fn().mockResolvedValue(undefined),
}));

const mockUpdateWidget = vi.fn();
const mockDashboardContext = {
  activeDashboard: {
    widgets: [],
    globalStyle: DEFAULT_GLOBAL_STYLE,
  },
  updateWidget: mockUpdateWidget,
};

// Helper: find the time display button whose text is split across child spans.
// getByText can't match text distributed across multiple <span> elements,
// so we match on the button's aggregate textContent instead.
const getTimeButton = (time: string) =>
  screen.getByText((_content, el) => {
    return el?.tagName === 'BUTTON' && el?.textContent === time;
  });

// Helper to render widget
const renderWidget = (widget: WidgetData) => {
  return render(<TimeToolWidget widget={widget} />);
};

describe('TimeToolWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (useDashboard as Mock).mockReturnValue(
      mockDashboardContext as unknown as DashboardContextValue
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
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
      config: {
        mode: 'timer',
        visualType: 'digital',
        duration: 300,
        elapsedTime: 300,
        isRunning: false,
        selectedSound: 'Chime',
        ...config,
      },
    } as WidgetData;
  };

  it('renders time correctly', () => {
    const widget = createWidget({ elapsedTime: 300 });
    renderWidget(widget);
    expect(getTimeButton('05:00')).toBeInTheDocument();
  });

  it('enters editing mode when clicking time display in timer mode', () => {
    const widget = createWidget({ mode: 'timer', isRunning: false });
    renderWidget(widget);

    fireEvent.click(getTimeButton('05:00'));

    expect(screen.getByText('005')).toBeInTheDocument(); // 3-digit minutes
    expect(screen.getByText('00')).toBeInTheDocument();
    // Buttons for 1-9 should be present
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('does not enter editing mode when running', () => {
    const widget = createWidget({ mode: 'timer', isRunning: true });
    renderWidget(widget);

    fireEvent.click(getTimeButton('05:00'));

    // Should NOT show the keypad (buttons 1-9)
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('updates edit values when clicking keypad', () => {
    const widget = createWidget({ elapsedTime: 300 });
    renderWidget(widget);

    fireEvent.click(getTimeButton('05:00'));

    // Initial is 005. Type 0, 1, 2 -> 050 -> 501 -> 012
    fireEvent.click(screen.getByText('0'));
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));

    expect(screen.getByText('012')).toBeInTheDocument();
  });

  it('confirms edit and updates widget', () => {
    const widget = createWidget({ elapsedTime: 300 });
    renderWidget(widget);

    fireEvent.click(getTimeButton('05:00'));

    // Set to 010:00
    fireEvent.click(screen.getByText('0'));
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('0'));

    // Confirm using aria-label
    const confirmButton = screen.getByLabelText('Confirm time');
    fireEvent.click(confirmButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'timetool-1',
      expect.objectContaining({
        config: expect.objectContaining({
          elapsedTime: 600,
          duration: 600,
        }) as unknown,
      })
    );
  });

  it('caps seconds at 59', () => {
    const widget = createWidget({ elapsedTime: 300 });
    renderWidget(widget);
    fireEvent.click(getTimeButton('05:00'));

    // Switch to seconds
    fireEvent.click(screen.getByText('00'));

    // Type 9, 9 -> 09 -> 59 (capped)
    fireEvent.click(screen.getByText('9'));
    fireEvent.click(screen.getByText('9'));

    expect(screen.getByText('59')).toBeInTheDocument();
  });

  it('supports backspace functionality', () => {
    const widget = createWidget({ elapsedTime: 300 });
    renderWidget(widget);
    fireEvent.click(getTimeButton('05:00'));

    // Minutes is 005. Type 1 -> 051
    fireEvent.click(screen.getByText('1'));
    expect(screen.getByText('051')).toBeInTheDocument();

    // Backspace -> 005
    fireEvent.click(screen.getByLabelText('Backspace'));
    expect(screen.getByText('005')).toBeInTheDocument();
  });

  it('cancels editing when clicking X button', () => {
    const widget = createWidget({ elapsedTime: 300 });
    renderWidget(widget);
    fireEvent.click(getTimeButton('05:00'));

    // Should be in editing mode
    expect(screen.getByLabelText('Close keypad')).toBeInTheDocument();

    // Click X
    fireEvent.click(screen.getByLabelText('Close keypad'));

    // Should be back to normal display
    expect(screen.queryByLabelText('Close keypad')).not.toBeInTheDocument();
    expect(getTimeButton('05:00')).toBeInTheDocument();
  });

  it('supports 3-digit minutes (e.g., 2 hours / 120 minutes)', () => {
    const widget = createWidget({ elapsedTime: 300 });
    renderWidget(widget);
    fireEvent.click(getTimeButton('05:00'));

    // Set minutes to 120
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('0'));

    expect(screen.getByText('120')).toBeInTheDocument();

    // Confirm
    fireEvent.click(screen.getByLabelText('Confirm time'));

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'timetool-1',
      expect.objectContaining({
        config: expect.objectContaining({
          elapsedTime: 120 * 60,
          duration: 120 * 60,
        }) as unknown,
      })
    );
  });

  describe('Adjust buttons (+/-)', () => {
    it('hides ± buttons in stopwatch mode', () => {
      const widget = createWidget({
        mode: 'stopwatch',
        isRunning: true,
        elapsedTime: 30,
      });
      renderWidget(widget);

      expect(screen.queryByLabelText('Add time')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Subtract time')).not.toBeInTheDocument();
    });

    it('hides ± buttons in fresh-setup state (timer not started, elapsed === duration)', () => {
      const widget = createWidget({
        mode: 'timer',
        isRunning: false,
        duration: 300,
        elapsedTime: 300,
      });
      renderWidget(widget);

      expect(screen.queryByLabelText('Add time')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Subtract time')).not.toBeInTheDocument();
    });

    it('shows ± buttons while the timer is running', () => {
      const widget = createWidget({
        mode: 'timer',
        isRunning: true,
        duration: 300,
        elapsedTime: 300,
      });
      renderWidget(widget);

      expect(screen.getByLabelText('Add time')).toBeInTheDocument();
      expect(screen.getByLabelText('Subtract time')).toBeInTheDocument();
    });

    it('shows ± buttons when paused mid-run (elapsed !== duration)', () => {
      const widget = createWidget({
        mode: 'timer',
        isRunning: false,
        duration: 300,
        elapsedTime: 120,
      });
      renderWidget(widget);

      expect(screen.getByLabelText('Add time')).toBeInTheDocument();
      expect(screen.getByLabelText('Subtract time')).toBeInTheDocument();
    });

    it('tapping + adds exactly one step (default 60s)', () => {
      const widget = createWidget({
        mode: 'timer',
        isRunning: false,
        duration: 300,
        elapsedTime: 120,
      });
      renderWidget(widget);

      fireEvent.pointerDown(screen.getByLabelText('Add time'));
      fireEvent.pointerUp(screen.getByLabelText('Add time'));

      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'timetool-1',
        expect.objectContaining({
          config: expect.objectContaining({
            elapsedTime: 180,
            duration: 300,
          }) as unknown,
        })
      );
    });

    it('tapping − at displayTime ≤ step clamps to 0 (does not go negative)', () => {
      const widget = createWidget({
        mode: 'timer',
        isRunning: false,
        duration: 300,
        elapsedTime: 30,
      });
      renderWidget(widget);

      fireEvent.pointerDown(screen.getByLabelText('Subtract time'));
      fireEvent.pointerUp(screen.getByLabelText('Subtract time'));

      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'timetool-1',
        expect.objectContaining({
          config: expect.objectContaining({
            elapsedTime: 0,
          }) as unknown,
        })
      );
    });

    it('adjusting + while running keeps isRunning true and refreshes startTime', () => {
      const startTime = Date.now() - 30_000;
      const widget = createWidget({
        mode: 'timer',
        isRunning: true,
        duration: 300,
        elapsedTime: 300,
        startTime,
      });
      renderWidget(widget);

      fireEvent.pointerDown(screen.getByLabelText('Add time'));
      fireEvent.pointerUp(screen.getByLabelText('Add time'));

      const lastCall = mockUpdateWidget.mock.calls.at(-1);
      expect(lastCall).toBeDefined();
      const updatedConfig = (lastCall?.[1] as { config: TimeToolConfig })
        .config;
      expect(updatedConfig.isRunning).toBe(true);
      expect(updatedConfig.startTime).not.toBeNull();
      expect(updatedConfig.startTime).not.toBe(startTime);
    });

    it('adjusting + past original duration bumps duration to match', () => {
      const widget = createWidget({
        mode: 'timer',
        isRunning: false,
        duration: 60,
        elapsedTime: 30,
        adjustStepSeconds: 120,
      });
      renderWidget(widget);

      fireEvent.pointerDown(screen.getByLabelText('Add time'));
      fireEvent.pointerUp(screen.getByLabelText('Add time'));

      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'timetool-1',
        expect.objectContaining({
          config: expect.objectContaining({
            elapsedTime: 150,
            duration: 150,
          }) as unknown,
        })
      );
    });

    it('Enter key on + fires a single 1× step (keyboard accessibility)', () => {
      const widget = createWidget({
        mode: 'timer',
        isRunning: false,
        duration: 300,
        elapsedTime: 120,
      });
      renderWidget(widget);

      fireEvent.keyDown(screen.getByLabelText('Add time'), { key: 'Enter' });

      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'timetool-1',
        expect.objectContaining({
          config: expect.objectContaining({
            elapsedTime: 180,
          }) as unknown,
        })
      );
    });

    it('Space key on − fires a single 1× step (keyboard accessibility)', () => {
      const widget = createWidget({
        mode: 'timer',
        isRunning: false,
        duration: 300,
        elapsedTime: 120,
      });
      renderWidget(widget);

      fireEvent.keyDown(screen.getByLabelText('Subtract time'), { key: ' ' });

      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'timetool-1',
        expect.objectContaining({
          config: expect.objectContaining({
            elapsedTime: 60,
          }) as unknown,
        })
      );
    });

    it('back-to-back synchronous + taps accumulate (ref updates synchronously)', () => {
      // Regression test for the press-and-hold ramp case: when adjustTime is
      // called multiple times in the same task before React commits a render,
      // each call must see the latest base, not the pre-render stale ref.
      const widget = createWidget({
        mode: 'timer',
        isRunning: true,
        duration: 600,
        elapsedTime: 600,
        startTime: Date.now(),
      });
      renderWidget(widget);

      const addBtn = screen.getByLabelText('Add time');
      fireEvent.pointerDown(addBtn);
      fireEvent.pointerUp(addBtn);
      fireEvent.pointerDown(addBtn);
      fireEvent.pointerUp(addBtn);
      fireEvent.pointerDown(addBtn);
      fireEvent.pointerUp(addBtn);

      const elapsedValues = mockUpdateWidget.mock.calls.map(
        (c) => (c[1] as { config: TimeToolConfig }).config.elapsedTime
      );
      expect(elapsedValues).toEqual([660, 720, 780]);
    });

    it('respects custom adjustStepSeconds value', () => {
      const widget = createWidget({
        mode: 'timer',
        isRunning: false,
        duration: 300,
        elapsedTime: 120,
        adjustStepSeconds: 30,
      });
      renderWidget(widget);

      fireEvent.pointerDown(screen.getByLabelText('Add time'));
      fireEvent.pointerUp(screen.getByLabelText('Add time'));

      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'timetool-1',
        expect.objectContaining({
          config: expect.objectContaining({
            elapsedTime: 150,
          }) as unknown,
        })
      );
    });
  });
});

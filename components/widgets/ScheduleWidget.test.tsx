/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from '@testing-library/react';
import { ScheduleWidget, ScheduleSettings } from './Schedule';
import { useDashboard } from '../../context/useDashboard';
import { useAuth } from '../../context/useAuth';
import { useFeaturePermissions } from '../../hooks/useFeaturePermissions';
import { WidgetData, ScheduleConfig, DEFAULT_GLOBAL_STYLE } from '../../types';

vi.mock('../../context/useDashboard');
vi.mock('../../context/useAuth');
vi.mock('../../hooks/useFeaturePermissions');

// jsdom does not implement HTMLElement.prototype.scrollTo.
// Define it once as a vi.fn() stub so that the widget's useLayoutEffect does
// not throw and vi.spyOn can wrap it in individual tests.
Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

// Mock useScaledFont to return a fixed size
vi.mock('../../hooks/useScaledFont', () => ({
  useScaledFont: () => 16,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Circle: () => <div data-testid="circle-icon" />,
  CheckCircle2: () => <div data-testid="check-icon" />,
  Type: () => <div>Type Icon</div>,
  Clock: () => <div>Clock Icon</div>,
  AlertTriangle: () => <div>Alert Icon</div>,
  Plus: () => <div>Plus Icon</div>,
  Timer: () => <div>Timer Icon</div>,
  Palette: () => <div>Palette Icon</div>,
  Trash2: () => <div>Trash Icon</div>,
  Pencil: () => <div>Pencil Icon</div>,
  X: () => <div>X Icon</div>,
  Save: () => <div>Save Icon</div>,
  GripVertical: () => <div>Grip Icon</div>,
  Settings2: () => <div>Settings2 Icon</div>,
  Calendar: () => <div>Calendar Icon</div>,
  LayoutGrid: () => <div>LayoutGrid Icon</div>,
  ChevronRight: () => <div>ChevronRight Icon</div>,
  Ban: () => <div>Ban Icon</div>,
}));

const mockUpdateWidget = vi.fn();
const mockAddWidget = vi.fn();

const mockDashboardContext = {
  activeDashboard: {
    globalStyle: DEFAULT_GLOBAL_STYLE,
    widgets: [],
  },
  updateWidget: mockUpdateWidget,
  addWidget: mockAddWidget,
};

describe('ScheduleWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (useDashboard as unknown as Mock).mockReturnValue(mockDashboardContext);
    (useAuth as unknown as Mock).mockReturnValue({
      profile: { selectedBuildings: ['b1'] },
    });
    (useFeaturePermissions as unknown as Mock).mockReturnValue({
      subscribeToPermission: vi.fn((type, cb) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        cb({ config: { blockedDates: [], buildingDefaults: {} } });
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return () => {};
      }),
    });
    mockUpdateWidget.mockClear();
    mockAddWidget.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    cleanup();
    vi.useRealTimers();
  });

  const createWidget = (config: Partial<ScheduleConfig> = {}): WidgetData => {
    return {
      id: 'schedule-1',
      type: 'schedule',
      x: 0,
      y: 0,
      w: 300,
      h: 400,
      z: 1,
      flipped: false,
      config: {
        items: [
          { time: '08:00', task: 'Math', done: false },
          { time: '09:00', task: 'Reading', done: false },
          { time: '10:00', task: 'Recess', done: false },
        ],
        ...config,
      },
    } as WidgetData;
  };

  it('renders schedule items', () => {
    render(<ScheduleWidget widget={createWidget()} />);
    expect(screen.getByText('Math')).toBeInTheDocument();
    // No clock widget in mock → defaults to 12-hour format
    expect(screen.getByText('8:00 AM')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  it('renders times in 24-hour format when clock widget has format24:true', () => {
    (useDashboard as unknown as Mock).mockReturnValue({
      ...mockDashboardContext,
      activeDashboard: {
        ...mockDashboardContext.activeDashboard,
        widgets: [{ id: 'clock-1', type: 'clock', config: { format24: true } }],
      },
    });
    render(<ScheduleWidget widget={createWidget()} />);
    expect(screen.getByText('08:00')).toBeInTheDocument();
  });

  it('shows countdown instead of clock time for a timer-mode item', () => {
    // 08:30 — 30 minutes remain until endTime 09:00 → displays "30:00"
    const date = new Date();
    date.setHours(8, 30, 0, 0);
    vi.setSystemTime(date);

    const widget = createWidget({
      items: [
        {
          id: 'item-1',
          time: '08:00',
          task: 'Math',
          done: false,
          mode: 'timer',
          startTime: '08:00',
          endTime: '09:00',
        },
      ],
    });
    render(<ScheduleWidget widget={widget} />);

    // Countdown: endTime 09:00 = 32400s, now = 8:30:00 = 30600s, rem = 1800s = 30:00
    expect(screen.getByText('30:00')).toBeInTheDocument();
    // Clock-format time should NOT appear
    expect(screen.queryByText('8:00 AM')).not.toBeInTheDocument();
  });

  it('auto-launches linked widgets exactly once when inside the time window', () => {
    // 09:05 — Math starts at 09:00, ends 10:00 → window is open
    const date = new Date();
    date.setHours(9, 5, 0, 0);
    vi.setSystemTime(date);

    const widget = createWidget({
      items: [
        {
          id: 'item-1',
          time: '09:00',
          task: 'Math',
          done: false,
          startTime: '09:00',
          endTime: '10:00',
          linkedWidgets: ['clock'],
        },
      ],
    });
    render(<ScheduleWidget widget={widget} />);

    // Launched once on mount
    expect(mockAddWidget).toHaveBeenCalledTimes(1);
    expect(mockAddWidget).toHaveBeenCalledWith('clock', expect.any(Object));

    // Subsequent interval ticks must NOT re-launch
    mockAddWidget.mockClear();
    act(() => {
      vi.advanceTimersByTime(10000); // one full interval
    });
    expect(mockAddWidget).not.toHaveBeenCalled();
  });

  it('does NOT auto-launch when current time is before item start', () => {
    const date = new Date();
    date.setHours(8, 55, 0, 0); // 5 minutes before 09:00
    vi.setSystemTime(date);

    const widget = createWidget({
      items: [
        {
          id: 'item-1',
          time: '09:00',
          task: 'Math',
          done: false,
          startTime: '09:00',
          linkedWidgets: ['clock'],
        },
      ],
    });
    render(<ScheduleWidget widget={widget} />);

    expect(mockAddWidget).not.toHaveBeenCalled();
  });

  it('toggles item status on click', () => {
    const widget = createWidget();
    render(<ScheduleWidget widget={widget} />);

    const mathItem = screen.getByText('Math').closest('button');
    if (!mathItem) throw new Error('Math item not found');
    fireEvent.click(mathItem);

    const updateCall = mockUpdateWidget.mock.calls[0];
    const newConfig = (updateCall[1] as { config: ScheduleConfig }).config;

    expect(mockUpdateWidget).toHaveBeenCalledWith('schedule-1', {
      config: expect.any(Object),
    });
    expect(newConfig.items[0].done).toBe(true);
  });

  it('applies font family from config', () => {
    const widget = createWidget({ fontFamily: 'mono' });
    const { container } = render(<ScheduleWidget widget={widget} />);

    // The inner container should have the font class
    const contentDiv = container.querySelector('.font-mono');
    expect(contentDiv).toBeInTheDocument();
  });

  it('auto-progresses items even without a clock widget', () => {
    // No clock widget
    (useDashboard as unknown as Mock).mockReturnValue({
      ...mockDashboardContext,
      activeDashboard: {
        ...mockDashboardContext.activeDashboard,
        widgets: [],
      },
    });

    // Set time BEFORE render to 09:30
    const date = new Date();
    date.setHours(9, 30, 0, 0);
    vi.setSystemTime(date);

    const widget = createWidget({ autoProgress: true });
    render(<ScheduleWidget widget={widget} />);

    // Should make 08:00 (Math) done, because 09:00 (Reading) has started.
    expect(mockUpdateWidget).toHaveBeenCalledWith('schedule-1', {
      config: expect.objectContaining({
        items: [
          expect.objectContaining({ task: 'Math', done: true }),
          expect.objectContaining({ task: 'Reading', done: false }),
          expect.objectContaining({ task: 'Recess', done: false }),
        ],
      }),
    });
  });

  it('marks all items as done when time is past the last item', () => {
    // Set time BEFORE render to 11:30 (Past Recess at 10:00 + 60 mins)
    const date = new Date();
    date.setHours(11, 30, 0, 0);
    vi.setSystemTime(date);

    const widget = createWidget({ autoProgress: true });
    render(<ScheduleWidget widget={widget} />);

    expect(mockUpdateWidget).toHaveBeenCalledWith('schedule-1', {
      config: expect.objectContaining({
        items: [
          expect.objectContaining({ task: 'Math', done: true }),
          expect.objectContaining({ task: 'Reading', done: true }),
          expect.objectContaining({ task: 'Recess', done: true }),
        ],
      }),
    });
  });

  describe('autoScroll', () => {
    it('gives rows calc height to fit 4 items regardless of autoScroll setting', () => {
      // Test with autoScroll: true
      const widgetTrue = createWidget({ autoScroll: true });
      const { container: containerTrue } = render(
        <ScheduleWidget widget={widgetTrue} />
      );
      // Both modes now use the calc((100% - 3 * gap) / 4) formula
      const rowsTrue = containerTrue.querySelectorAll('[style*="calc"]');
      expect(rowsTrue.length).toBe(3);

      cleanup();

      // Test with autoScroll: false
      const widgetFalse = createWidget({ autoScroll: false });
      const { container: containerFalse } = render(
        <ScheduleWidget widget={widgetFalse} />
      );
      const rowsFalse = containerFalse.querySelectorAll('[style*="calc"]');
      expect(rowsFalse.length).toBe(3);
    });

    it('highlights the currently active item with "Now" badge', () => {
      // 09:15 — inside the 09:00–10:00 Reading window.
      const date = new Date();
      date.setHours(9, 15, 0, 0);
      vi.setSystemTime(date);

      const widget = createWidget({
        items: [
          { time: '08:00', task: 'Math', done: true },
          { time: '09:00', task: 'Reading', done: false },
          { time: '10:00', task: 'Recess', done: false },
        ],
      });
      render(<ScheduleWidget widget={widget} />);

      // "Now" badge should be visible
      expect(screen.getByText(/now/i)).toBeInTheDocument();
      // Should be associated with the "Reading" item
      const readingItem = screen.getByText('Reading').closest('.relative');
      expect(readingItem).toHaveTextContent(/now/i);
    });
    it('calls scrollTo when an item is currently active and autoScroll is on', () => {
      // 09:15 — inside the 09:00–10:00 Reading window.
      const date = new Date();
      date.setHours(9, 15, 0, 0);
      vi.setSystemTime(date);

      const scrollToSpy = vi.spyOn(HTMLElement.prototype, 'scrollTo');

      const widget = createWidget({ autoScroll: true });
      render(<ScheduleWidget widget={widget} />);

      expect(scrollToSpy).toHaveBeenCalled();
      scrollToSpy.mockRestore();
    });

    it('does not call scrollTo when autoScroll is disabled', () => {
      const date = new Date();
      date.setHours(9, 15, 0, 0);
      vi.setSystemTime(date);

      const scrollToSpy = vi.spyOn(HTMLElement.prototype, 'scrollTo');

      const widget = createWidget({ autoScroll: false });
      render(<ScheduleWidget widget={widget} />);

      expect(scrollToSpy).not.toHaveBeenCalled();
      scrollToSpy.mockRestore();
    });

    it('identifies the active item correctly when items are in non-chronological array order', () => {
      // 09:30 — falls inside the 09:00–10:00 window (Reading), which is stored
      // at array index 2 in this intentionally reversed list.
      const date = new Date();
      date.setHours(9, 30, 0, 0);
      vi.setSystemTime(date);

      const scrollToSpy = vi.spyOn(HTMLElement.prototype, 'scrollTo');

      const widget = createWidget({
        autoScroll: true,
        items: [
          // Deliberately reversed — Recess first, Math last.
          {
            id: '3',
            time: '10:00',
            startTime: '10:00',
            task: 'Recess',
            done: false,
            mode: 'clock' as const,
            linkedWidgets: [],
          },
          {
            id: '2',
            time: '09:00',
            startTime: '09:00',
            task: 'Reading',
            done: false,
            mode: 'clock' as const,
            linkedWidgets: [],
          },
          {
            id: '1',
            time: '08:00',
            startTime: '08:00',
            task: 'Math',
            done: false,
            mode: 'clock' as const,
            linkedWidgets: [],
          },
        ],
      });
      render(<ScheduleWidget widget={widget} />);

      // scrollTo should be called — the active item (Reading at index 1) was found
      // even though items are not in chronological array order.
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'smooth' })
      );
      scrollToSpy.mockRestore();
    });
  });

  it('renders the schedule matching the current day', () => {
    // Force date to Monday
    const monday = new Date(2023, 0, 2); // Jan 2, 2023 is Monday
    vi.setSystemTime(monday);

    const widget = {
      id: 'schedule-1',
      type: 'schedule',
      config: {
        schedules: [
          {
            id: 's1',
            name: 'Monday Schedule',
            items: [{ time: '09:00', task: 'Math', done: false }],
            days: [1], // Monday
          },
          {
            id: 's2',
            name: 'Tuesday Schedule',
            items: [{ time: '09:00', task: 'Science', done: false }],
            days: [2], // Tuesday
          },
        ],
      },
    } as unknown as WidgetData;

    const { rerender } = render(<ScheduleWidget widget={widget} />);
    expect(screen.getByText('Math')).toBeInTheDocument();
    expect(screen.queryByText('Science')).not.toBeInTheDocument();

    // Force date to Tuesday
    const tuesday = new Date(2023, 0, 3); // Jan 3, 2023 is Tuesday
    vi.setSystemTime(tuesday);
    rerender(<ScheduleWidget widget={widget} />);
    expect(screen.getByText('Science')).toBeInTheDocument();
    expect(screen.queryByText('Math')).not.toBeInTheDocument();
  });

  it('renders nothing if no schedule matches the current day (when multiple exist)', () => {
    const sunday = new Date(2023, 0, 1); // Jan 1, 2023 is Sunday
    vi.setSystemTime(sunday);

    const widget = {
      id: 'schedule-1',
      type: 'schedule',
      config: {
        schedules: [
          {
            id: 's1',
            name: 'Monday Schedule',
            items: [{ time: '09:00', task: 'Math', done: false }],
            days: [1],
          },
          {
            id: 's2',
            name: 'Tuesday Schedule',
            items: [{ time: '09:00', task: 'Science', done: false }],
            days: [2],
          },
        ],
      },
    } as unknown as WidgetData;

    render(<ScheduleWidget widget={widget} />);
    expect(screen.queryByText('Math')).not.toBeInTheDocument();
    expect(screen.queryByText('Science')).not.toBeInTheDocument();
    expect(screen.getByText('No Schedule')).toBeInTheDocument();
  });
});

describe('ScheduleSettings', () => {
  beforeEach(() => {
    (useDashboard as unknown as Mock).mockReturnValue(mockDashboardContext);
    (useAuth as unknown as Mock).mockReturnValue({
      profile: { selectedBuildings: ['b1'] },
    });
    (useFeaturePermissions as unknown as Mock).mockReturnValue({
      subscribeToPermission: vi.fn(),
    });
    mockUpdateWidget.mockClear();
  });

  const createWidget = (config: Partial<ScheduleConfig> = {}): WidgetData => {
    return {
      id: 'schedule-1',
      type: 'schedule',
      config: {
        items: [],
        ...config,
      },
    } as WidgetData;
  };

  it('renders settings controls', () => {
    render(<ScheduleSettings widget={createWidget()} />);

    expect(screen.getByText(/typography/i)).toBeInTheDocument();
    expect(screen.getByText(/auto-checkoff/i)).toBeInTheDocument();
  });

  it('renders the Auto-Scroll View toggle', () => {
    render(<ScheduleSettings widget={createWidget()} />);
    expect(screen.getByText('Auto-Scroll View')).toBeInTheDocument();
  });

  it('saves autoScroll:true when the Auto-Scroll View toggle is clicked', () => {
    render(<ScheduleSettings widget={createWidget({ autoScroll: false })} />);

    // The settings panel contains three role="switch" toggles in order:
    // 0 = Auto-Complete Items, 1 = Auto-Scroll View, 2 = Sync Building Schedule.
    const switches = screen.getAllByRole('switch');
    const autoScrollToggle = switches[1];
    fireEvent.click(autoScrollToggle);

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'schedule-1',
      expect.objectContaining({
        config: expect.objectContaining({ autoScroll: true }),
      })
    );
  });

  it('sorts items chronologically when a new item is saved via the add form', () => {
    // Start with one item at 10:00.
    const widget = createWidget({
      items: [
        {
          id: 'existing',
          time: '10:00',
          startTime: '10:00',
          task: 'Later Class',
          done: false,
          mode: 'clock' as const,
          linkedWidgets: [],
        },
      ],
    });
    const { container } = render(<ScheduleSettings widget={widget} />);

    // Select the default schedule first
    fireEvent.click(screen.getByTitle(/edit items/i));

    // Open the add-event form.
    fireEvent.click(screen.getByRole('button', { name: /add event/i }));

    // Fill in task name.
    const taskInput = container.querySelector(
      'input[placeholder="e.g. Math Class"]'
    ) as HTMLInputElement;
    fireEvent.change(taskInput, { target: { value: 'Early Class' } });

    // Fill in start time (first <input type="time"> in the form).
    const [startTimeInput] = container.querySelectorAll('input[type="time"]');
    fireEvent.change(startTimeInput, { target: { value: '08:00' } });

    // Submit the form.
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    // The saved items must be sorted: Early Class (08:00) before Later Class (10:00).
    const savedItems = (
      mockUpdateWidget.mock.calls[0][1] as {
        config: { items: { task: string }[] };
      }
    ).config.items;
    expect(savedItems[0].task).toBe('Early Class');
    expect(savedItems[1].task).toBe('Later Class');
  });
});

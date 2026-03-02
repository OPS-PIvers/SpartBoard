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

  it('auto-progresses items when connected to clock', () => {
    // Mock a clock widget being present
    (useDashboard as unknown as Mock).mockReturnValue({
      ...mockDashboardContext,
      activeDashboard: {
        ...mockDashboardContext.activeDashboard,
        widgets: [{ id: 'clock-1', type: 'clock' }],
      },
    });

    // Set time BEFORE render to 09:30
    const date = new Date();
    date.setHours(9, 30, 0, 0);
    vi.setSystemTime(date);

    const widget = createWidget({ autoProgress: true });
    render(<ScheduleWidget widget={widget} />);

    // Should make 08:00 (Math) done, because 09:00 (Reading) has started.
    // 09:00 (Reading) should be active (not done).
    // 10:00 (Recess) should be future (not done).

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
    // Mock a clock widget being present
    (useDashboard as unknown as Mock).mockReturnValue({
      ...mockDashboardContext,
      activeDashboard: {
        ...mockDashboardContext.activeDashboard,
        widgets: [{ id: 'clock-1', type: 'clock' }],
      },
    });

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

  it('does NOT auto-progress if no clock widget is present', () => {
    // No clock widget
    (useDashboard as unknown as Mock).mockReturnValue({
      ...mockDashboardContext,
      activeDashboard: {
        ...mockDashboardContext.activeDashboard,
        widgets: [],
      },
    });

    // Set time BEFORE render
    const date = new Date();
    date.setHours(9, 30, 0, 0);
    vi.setSystemTime(date);

    const widget = createWidget({ autoProgress: true });
    render(<ScheduleWidget widget={widget} />);

    expect(mockUpdateWidget).not.toHaveBeenCalled();
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
});

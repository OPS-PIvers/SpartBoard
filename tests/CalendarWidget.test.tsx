import { render, screen } from '@testing-library/react';
import { CalendarWidget } from '@/components/widgets/Calendar/Widget';
import { expect, test, vi, describe, beforeEach, afterEach } from 'vitest';
import { WidgetData, DEFAULT_GLOBAL_STYLE } from '@/types';

// CalendarWidget reads addWidget from the mount-stable useDashboardActions()
// surface and the active board style from useGlobalStyle() — both from the
// canvas store, not the legacy useDashboard() context.
vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({
    addWidget: vi.fn(),
  }),
  useGlobalStyle: () => DEFAULT_GLOBAL_STYLE,
}));

vi.mock('@/hooks/useFeaturePermissions', () => ({
  useFeaturePermissions: () => ({
    subscribeToPermission: vi.fn(),
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    selectedBuildings: [],
    // Path B: the widget acquires the calendar.readonly scope on demand. With
    // no personal calendars configured in these tests it's never called, but
    // provide a null-resolving stub so the surface matches the real hook.
    ensureGoogleScope: vi.fn().mockResolvedValue(null),
  }),
}));

describe('CalendarWidget handleStartTimer', () => {
  beforeEach(() => {
    // Pin clock to noon so +10 min never crosses midnight
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z')); // explicit UTC noon
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('Renders timer button when there is an event in the future', () => {
    // Generate a future time for today
    const now = new Date();
    const future = new Date(now.getTime() + 10 * 60000); // 10 mins from now

    const todayStr = now.toISOString().split('T')[0];
    const timeStr = `${future.getHours()}:${future.getMinutes().toString().padStart(2, '0')}`;

    const widget: WidgetData = {
      id: 'test-cal',
      type: 'calendar',
      x: 0,
      y: 0,
      w: 400,
      h: 400,
      z: 1,
      flipped: false,
      config: {
        events: [
          {
            date: todayStr,
            time: timeStr,
            title: 'Future Event',
          },
        ],
      },
    };

    render(<CalendarWidget widget={widget} />);

    expect(screen.getByText('Future Event')).toBeInTheDocument();

    // The timer button should be rendered
    const timerBtn = screen.getByTitle('Start countdown to event');
    expect(timerBtn).toBeInTheDocument();
  });
});

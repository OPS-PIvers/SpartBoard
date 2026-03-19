import { render, screen } from '@testing-library/react';
import { CalendarWidget } from '../components/widgets/Calendar/Widget';
import { expect, test, vi, describe } from 'vitest';
import { WidgetData } from '../types';

vi.mock('../context/useDashboard', () => ({
  useDashboard: () => ({
    addWidget: vi.fn(),
    activeDashboard: { globalStyle: { fontFamily: 'sans' } },
  }),
}));

vi.mock('../hooks/useFeaturePermissions', () => ({
  useFeaturePermissions: () => ({
    subscribeToPermission: vi.fn(),
  }),
}));

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({
    selectedBuildings: [],
  }),
}));

vi.mock('../hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    calendarService: null,
    isConnected: false,
  }),
}));

describe('CalendarWidget handleStartTimer', () => {
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

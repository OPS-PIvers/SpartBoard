import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarWidget } from './Widget';
import type { CalendarConfig, WidgetData } from '@/types';

vi.mock('../WidgetLayout', () => ({
  WidgetLayout: ({ content }: { content: React.ReactNode }) => (
    <div data-testid="widget-layout">{content}</div>
  ),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: {
      globalStyle: { fontFamily: 'sans' },
      widgets: [],
    },
    addWidget: vi.fn(),
    updateWidget: vi.fn(),
  }),
}));

vi.mock('@/hooks/useFeaturePermissions', () => ({
  useFeaturePermissions: () => ({
    subscribeToPermission: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: () => null,
}));

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    calendarService: null,
    isConnected: false,
  }),
}));

const buildWidget = (config: Partial<CalendarConfig>): WidgetData =>
  ({
    id: 'calendar-widget',
    type: 'calendar',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    flipped: false,
    config: {
      events: [],
      isBuildingSyncEnabled: false,
      daysVisible: 5,
      ...config,
    } satisfies CalendarConfig,
  }) as WidgetData;

describe('CalendarWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-evaluates the date window when midnight passes without any other dep change', () => {
    // Start at 11:58 PM on June 13.  Tomorrow is June 14.
    vi.setSystemTime(new Date('2026-06-13T23:58:00.000Z'));

    // The event is on June 14 (UTC date).  With today = June 13 and daysVisible=5,
    // it is within the window (June 13..17) so it SHOULD be shown.
    // (We verify this basic initial render works, then focus on the midnight cross.)
    const widget = buildWidget({
      events: [{ date: '2026-06-14', title: 'Morning Assembly' }],
      daysVisible: 5,
    });

    render(<CalendarWidget widget={widget} />);
    expect(screen.getByText('Morning Assembly')).toBeInTheDocument();

    // Now advance the clock to June 19 23:58 — 6 days later.
    // Without an internal ticker the useMemo still thinks today = June 13
    // so the event (June 14) remains inside the [today, today+5) window.
    // With the fix, todayMidnightMs updates every 60 s, so after advancing
    // ~7 days the memo sees today = June 20 and June 14 is now in the past.
    act(() => {
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000); // 7 days
    });

    // June 14 is now 6 days in the past — it must no longer appear.
    // Before fix: stale today = June 13 → event (June 14) still shown. FAIL.
    // After fix: today = June 20 → event outside window. PASS.
    expect(screen.queryByText('Morning Assembly')).not.toBeInTheDocument();
  });
});

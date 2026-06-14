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
    vi.restoreAllMocks();
  });

  it('labels an event as Today using local date, not UTC date (regression: UTC+12 midnight)', () => {
    // Scenario: UTC+12 user at local midnight 2026-06-15 (= 2026-06-14T12:00:00Z).
    //
    // Bug (old code):  new Date().toISOString().split('T')[0]
    //   → toISOString() converts to UTC → "2026-06-14T12:00:00.000Z" → today = "2026-06-14"
    //   → event on "2026-06-15" does NOT match → "Today" badge never shown.
    //
    // Fix (new code):  getFullYear/getMonth/getDate (local-time methods)
    //   → mocked to return 2026-06-15 → today = "2026-06-15"
    //   → event on "2026-06-15" matches → "Today" badge shown correctly.
    //
    // The test environment pins TZ=UTC (tests/setTz.ts), so we mock the three
    // local-time methods on Date.prototype to simulate a UTC+12 local date.
    // The prototype spies are restored by vi.restoreAllMocks() in afterEach.
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z')); // UTC epoch

    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(5); // June (0-indexed)
    vi.spyOn(Date.prototype, 'getDate').mockReturnValue(15); // local day in UTC+12

    const widget = buildWidget({
      events: [{ date: '2026-06-15', title: 'Class Photo Day' }],
      daysVisible: 5,
    });

    render(<CalendarWidget widget={widget} />);

    // With the fix: today = "2026-06-15" (local) → badge shows "Today".
    // With the old bug: today = "2026-06-14" (UTC) → event not labeled "Today".
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Class Photo Day')).toBeInTheDocument();
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

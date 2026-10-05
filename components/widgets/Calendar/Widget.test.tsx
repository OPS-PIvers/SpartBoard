import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarWidget } from './Widget';
import { DEFAULT_GLOBAL_STYLE } from '@/types';
import type { CalendarConfig, CalendarEvent, WidgetData } from '@/types';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { noSubShareKey } from '@/tests/testHelpers/subShareContent';
import {
  useGlobalStyle,
  useDashboardActions,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

vi.mock('../WidgetLayout', () => ({
  WidgetLayout: ({ content }: { content: React.ReactNode }) => (
    <div data-testid="widget-layout">{content}</div>
  ),
}));

vi.mock('@/context/dashboardCanvasStore');

vi.mock('@/hooks/useFeaturePermissions', () => ({
  useFeaturePermissions: () => ({
    subscribeToPermission: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: () => null,
}));

// Path B: the widget acquires the calendar.readonly scope on demand via
// useAuth().ensureGoogleScope. Tests override this per-scenario.
const ensureGoogleScopeMock = vi.fn();
const dayView = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    ensureGoogleScope: ensureGoogleScopeMock,
    canAccessFeature: (id: string) =>
      id === 'calendar-day-view' && dayView.enabled,
  }),
}));

// The widget builds GoogleCalendarService(token) from the on-demand token.
// Stub getEvents so the "already-granted" scenario yields a deterministic event.
const getEventsMock = vi.fn();
vi.mock('@/utils/googleCalendarService', () => ({
  GoogleCalendarService: class {
    getEvents = getEventsMock;
  },
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
    vi.mocked(useGlobalStyle).mockReturnValue({
      ...DEFAULT_GLOBAL_STYLE,
      fontFamily: 'sans',
    });
    vi.mocked(useDashboardActions).mockReturnValue({
      addWidget: vi.fn(),
      updateWidget: vi.fn(),
    } as unknown as DashboardActions);
    ensureGoogleScopeMock.mockReset();
    // Default: never-granted (silent acquisition returns null). Scenarios that
    // need an already-granted user override this.
    ensureGoogleScopeMock.mockResolvedValue(null);
    getEventsMock.mockReset();
    getEventsMock.mockResolvedValue([]);
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

  it('orders same-day events by start time across sources', () => {
    vi.setSystemTime(new Date('2026-06-15T06:00:00.000Z'));
    const widget = buildWidget({
      events: [
        { date: '2026-06-15', time: '14:30', title: 'Afternoon Meeting' },
        { date: '2026-06-15', time: '8:00 AM', title: 'Morning Duty' },
        { date: '2026-06-15', title: 'All Day Spirit Day' },
      ],
    });
    render(<CalendarWidget widget={widget} />);
    const order = ['All Day Spirit Day', 'Morning Duty', 'Afternoon Meeting'];
    const positions = order.map((t) => screen.getByText(t));
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i - 1].compareDocumentPosition(positions[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  describe('Path B — on-demand calendar.readonly acquisition', () => {
    it('never-granted: silent acquisition fails → NO auto-popup, shows Connect CTA', async () => {
      vi.useRealTimers();
      // Silent acquisition (no interactive opts) resolves null.
      ensureGoogleScopeMock.mockResolvedValue(null);

      const widget = buildWidget({
        events: [],
        personalCalendarIds: ['teacher@example.com'],
      });

      render(<CalendarWidget widget={widget} />);

      // The connect affordance appears once the silent miss resolves.
      await waitFor(() => {
        expect(screen.getByText('Connect Google Calendar')).toBeInTheDocument();
      });

      // CRITICAL: the effect must call ensureGoogleScope SILENTLY (no
      // interactive flag) — never auto-popup from the non-gesture effect.
      expect(ensureGoogleScopeMock).toHaveBeenCalledWith('calendar.readonly');
      const calls = ensureGoogleScopeMock.mock.calls as Array<
        [string, { interactive?: boolean }?]
      >;
      const interactiveCalls = calls.filter((c) => c[1]?.interactive === true);
      expect(interactiveCalls).toHaveLength(0);

      // No personal events fetched (no token).
      expect(getEventsMock).not.toHaveBeenCalled();
    });

    it('already-granted: silent acquisition returns a token → fetches, no CTA', async () => {
      vi.useRealTimers();
      // Silent acquisition succeeds (already-granted user).
      ensureGoogleScopeMock.mockResolvedValue('calendar-token');
      // Use today's local date so the event falls inside the daysVisible window.
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      getEventsMock.mockResolvedValue([
        { date: todayStr, title: 'Personal Sync Event' },
      ]);

      const widget = buildWidget({
        events: [],
        personalCalendarIds: ['teacher@example.com'],
      });

      render(<CalendarWidget widget={widget} />);

      // The personal event from the calendar service is rendered.
      await waitFor(() => {
        expect(screen.getByText('Personal Sync Event')).toBeInTheDocument();
      });

      // No connect CTA for an already-granted user.
      expect(
        screen.queryByText('Connect Google Calendar')
      ).not.toBeInTheDocument();
      // Fetch ran with the personal calendar id.
      expect(getEventsMock).toHaveBeenCalled();
    });
  });
});

// `/subs` renders the teacher's board: a substitute holds no token for the
// teacher's Google account, so the bundled events stand in and nothing is
// fetched or connected.
describe('CalendarWidget — inside a sub share', () => {
  beforeEach(() => {
    vi.mocked(useGlobalStyle).mockReturnValue({
      ...DEFAULT_GLOBAL_STYLE,
      fontFamily: 'sans',
    });
    vi.mocked(useDashboardActions).mockReturnValue({
      addWidget: vi.fn(),
      updateWidget: vi.fn(),
    } as unknown as DashboardActions);
    ensureGoogleScopeMock.mockReset();
    ensureGoogleScopeMock.mockResolvedValue(null);
    getEventsMock.mockReset();
    getEventsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function InShare({
    events,
    children,
  }: {
    events: CalendarEvent[];
    children: React.ReactNode;
  }) {
    return (
      <SubShareContentContext.Provider
        value={subShareContextValue({
          shareId: 'share-1',
          version: 0,
          loadKey: noSubShareKey,
          load: () => Promise.resolve({ events }),
        })}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  }

  it('shows the events bundled at share time', async () => {
    const widget = buildWidget({
      events: [],
      personalCalendarIds: ['teacher@example.com'],
    });

    render(
      <InShare events={[{ date: today(), title: 'Bundled Staff Meeting' }]}>
        <CalendarWidget widget={widget} />
      </InShare>
    );

    await waitFor(() => {
      expect(screen.getByText('Bundled Staff Meeting')).toBeInTheDocument();
    });
  });

  it('asks for no Google scope and fetches no calendar', async () => {
    const widget = buildWidget({
      events: [],
      personalCalendarIds: ['teacher@example.com'],
    });

    render(
      <InShare events={[{ date: today(), title: 'Bundled Staff Meeting' }]}>
        <CalendarWidget widget={widget} />
      </InShare>
    );

    await waitFor(() => {
      expect(screen.getByText('Bundled Staff Meeting')).toBeInTheDocument();
    });
    expect(ensureGoogleScopeMock).not.toHaveBeenCalled();
    expect(getEventsMock).not.toHaveBeenCalled();
  });

  it('offers no Connect Google Calendar button', async () => {
    const widget = buildWidget({
      events: [{ date: today(), title: 'Local Event' }],
      personalCalendarIds: ['teacher@example.com'],
    });

    render(
      <InShare events={[]}>
        <CalendarWidget widget={widget} />
      </InShare>
    );

    await waitFor(() => {
      expect(screen.getByText('Local Event')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Connect Google Calendar')
    ).not.toBeInTheDocument();
  });

  it('still shows the events the teacher typed into the widget', async () => {
    const widget = buildWidget({
      events: [{ date: today(), title: 'Local Event' }],
      personalCalendarIds: ['teacher@example.com'],
    });

    render(
      <InShare events={[{ date: today(), title: 'Bundled Staff Meeting' }]}>
        <CalendarWidget widget={widget} />
      </InShare>
    );

    await waitFor(() => {
      expect(screen.getByText('Local Event')).toBeInTheDocument();
    });
    expect(screen.getByText('Bundled Staff Meeting')).toBeInTheDocument();
  });
});

describe('CalendarWidget day view', () => {
  beforeEach(() => {
    dayView.enabled = true;
    vi.mocked(useGlobalStyle).mockReturnValue({
      ...DEFAULT_GLOBAL_STYLE,
      fontFamily: 'sans',
    });
    vi.mocked(useDashboardActions).mockReturnValue({
      addWidget: vi.fn(),
      updateWidget: vi.fn(),
    } as unknown as DashboardActions);
    ensureGoogleScopeMock.mockReset();
    ensureGoogleScopeMock.mockResolvedValue(null);
    getEventsMock.mockReset();
    getEventsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    dayView.enabled = false;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const monday: CalendarEvent[] = [
    {
      date: '2026-10-05',
      time: '7:30 AM',
      endTime: '8:15 AM',
      title: 'Staff meeting',
    },
    {
      date: '2026-10-05',
      time: '10:30 AM',
      endTime: '11:20 AM',
      title: 'Grade 7 PLC',
      location: 'Room 118',
      description: 'Bring unit 2 data.',
    },
    { date: '2026-10-06', time: '8:00 AM', title: 'Picture day' },
  ];

  it('shows a header per day and hides events that have ended', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T10:40:00'));
    render(<CalendarWidget widget={buildWidget({ events: monday })} />);

    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('October 5th')).toBeInTheDocument();
    expect(screen.getByText('Tuesday')).toBeInTheDocument();
    expect(screen.getByText('Grade 7 PLC')).toBeInTheDocument();
    expect(screen.queryByText('Staff meeting')).not.toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  it('keeps ended events above the fold when set to scroll', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T10:40:00'));
    render(
      <CalendarWidget
        widget={buildWidget({ events: monday, pastEvents: 'scroll' })}
      />
    );

    expect(screen.getByText('Staff meeting')).toBeInTheDocument();
  });

  it('opens the event details on tap', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T10:40:00'));
    render(<CalendarWidget widget={buildWidget({ events: monday })} />);

    act(() => {
      screen.getByText('Grade 7 PLC').click();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(
      'Monday, October 5th · 10:30 AM – 11:20 AM'
    );
    expect(dialog).toHaveTextContent('Room 118');
    expect(dialog).toHaveTextContent('Bring unit 2 data.');
  });

  it('asks Google for event details', async () => {
    ensureGoogleScopeMock.mockResolvedValue('calendar-token');
    render(
      <CalendarWidget
        widget={buildWidget({ personalCalendarIds: ['teacher@example.com'] })}
      />
    );

    await waitFor(() => {
      expect(getEventsMock).toHaveBeenCalledWith(
        'teacher@example.com',
        expect.any(String),
        expect.any(String),
        { details: true }
      );
    });
  });
});

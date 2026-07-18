import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CountdownWidget } from './Widget';
import { parseConfigDate } from './utils';
import { CountdownConfig, WidgetData, DEFAULT_GLOBAL_STYLE } from '@/types';
import { useGlobalStyle } from '@/context/dashboardCanvasStore';

vi.mock('../WidgetLayout', () => ({
  WidgetLayout: ({ content }: { content: React.ReactNode }) => (
    <div data-testid="widget-layout">{content}</div>
  ),
}));

vi.mock('@/context/dashboardCanvasStore');

const buildWidget = (config: Partial<CountdownConfig>): WidgetData =>
  ({
    id: 'countdown-widget',
    type: 'countdown',
    x: 0,
    y: 0,
    w: 300,
    h: 250,
    z: 1,
    flipped: false,
    config: {
      title: 'Field Trip',
      startDate: '2026-04-03T12:00:00.000Z',
      eventDate: '2026-04-06T12:00:00.000Z',
      includeWeekends: true,
      countToday: true,
      viewMode: 'number',
      ...config,
    } satisfies CountdownConfig,
  }) as WidgetData;

describe('CountdownWidget', () => {
  beforeEach(() => {
    vi.mocked(useGlobalStyle).mockReturnValue({
      ...DEFAULT_GLOBAL_STYLE,
      fontFamily: 'sans',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the current day as excluded in grid mode when countToday is off', () => {
    render(
      <CountdownWidget
        widget={buildWidget({
          countToday: false,
          viewMode: 'grid',
        })}
      />
    );

    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('keeps the headline countdown in sync with the same countToday rule', () => {
    render(<CountdownWidget widget={buildWidget({ countToday: false })} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/days until/i)).toBeInTheDocument();
  });

  it('applies eventColor to the event title and does not use the hardcoded brand-blue class', () => {
    render(<CountdownWidget widget={buildWidget({ eventColor: '#ff0000' })} />);

    const titleEl = screen.getByText('Field Trip');
    expect(titleEl).toHaveStyle({ color: '#ff0000' });
    expect(titleEl).not.toHaveClass('text-brand-blue-primary');
  });

  it('uses the default brand-blue eventColor when none is configured', () => {
    render(<CountdownWidget widget={buildWidget({})} />);

    const titleEl = screen.getByText('Field Trip');
    expect(titleEl).toHaveStyle({ color: '#2d3f89' });
    expect(titleEl).not.toHaveClass('text-brand-blue-primary');
  });

  it('recalculates the count when midnight passes without a config change', () => {
    // Start on April 3. Event is April 6. countToday=true, includeWeekends=true.
    // Days remaining: Apr 3, Apr 4, Apr 5 → 3
    render(<CountdownWidget widget={buildWidget({ countToday: true })} />);
    expect(screen.getByText('3')).toBeInTheDocument();

    // Advance 25 hours so the system clock crosses midnight into April 4.
    // Days remaining: Apr 4, Apr 5 → 2
    act(() => {
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    });

    // The widget must re-render and show the updated count.
    // Without an internal ticker that re-triggers the useMemo, this fails.
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });
});

describe('parseConfigDate (bare-date UTC-midnight parsing regression)', () => {
  it('anchors a bare YYYY-MM-DD string at local noon, not UTC midnight', () => {
    // Timezone-independent: `new Date(year, month, day, 12)`'s own local
    // getters always echo back what was constructed, in any process TZ.
    // The pre-fix `new Date('2026-12-25')` parses as UTC midnight, which
    // reads back as hour 0 (not 12) under this suite's TZ=UTC pin regardless
    // of the host machine's real timezone.
    const result = parseConfigDate('2026-12-25');
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(11);
    expect(result.getDate()).toBe(25);
    expect(result.getHours()).toBe(12);
  });

  it('falls through to plain Date parsing for full ISO timestamps', () => {
    const result = parseConfigDate('2026-12-25T12:00:00.000Z');
    expect(result.toISOString()).toBe('2026-12-25T12:00:00.000Z');
  });
});

describe('CountdownWidget bare-date config (UTC-midnight parsing regression)', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Chicago');
    vi.mocked(useGlobalStyle).mockReturnValue({
      ...DEFAULT_GLOBAL_STYLE,
      fontFamily: 'sans',
    });
    vi.useFakeTimers();
    // 8:00 AM CST, Dec 20 2026 (14:00 UTC). December avoids DST ambiguity.
    vi.setSystemTime(new Date('2026-12-20T14:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('counts a bare-date eventDate against its intended local calendar day', () => {
    render(
      <CountdownWidget
        widget={buildWidget({
          startDate: '2026-12-01T12:00:00.000Z',
          eventDate: '2026-12-25',
          countToday: true,
          includeWeekends: true,
        })}
      />
    );

    // Dec 20 (today, CST) through Dec 24 counted, event lands on Dec 25 → 5.
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});

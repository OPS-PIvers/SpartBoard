import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Profiler } from 'react';
import type { ProfilerOnRenderCallback } from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { useGlobalStyle } from '@/context/dashboardCanvasStore';
import { WidgetData, ClockConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import {
  ClockWidget,
  getClockTimeFontSize,
  CLOCK_DATE_FONT_SIZE,
} from './Widget';

vi.mock('@/context/dashboardCanvasStore');

// Helper to render widget
const renderWidget = (widget: WidgetData) => {
  return render(<ClockWidget widget={widget} />);
};

describe('ClockWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(useGlobalStyle).mockReturnValue(DEFAULT_GLOBAL_STYLE);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  const createWidget = (config: Partial<ClockConfig> = {}): WidgetData => {
    return {
      id: 'clock-1',
      type: 'clock',
      x: 0,
      y: 0,
      w: 200,
      h: 100,
      z: 1,
      config: {
        format24: true,
        showSeconds: true,
        themeColor: '#000000',
        fontFamily: 'global',
        clockStyle: 'modern',
        ...config,
      },
    } as WidgetData;
  };

  it('renders time correctly in 24h format', () => {
    const date = new Date('2023-01-01T14:30:45');
    vi.setSystemTime(date);

    renderWidget(createWidget({ format24: true }));

    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
  });

  it('renders time correctly in 12h format', () => {
    const date = new Date('2023-01-01T14:30:45');
    vi.setSystemTime(date);

    renderWidget(createWidget({ format24: false }));

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('PM')).toBeInTheDocument();
  });

  it('updates time every second', () => {
    const date = new Date('2023-01-01T14:30:45');
    vi.setSystemTime(date);

    renderWidget(createWidget({ showSeconds: true }));

    expect(screen.getByText('45')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('46')).toBeInTheDocument();
  });

  it('hides seconds when configured', () => {
    // Let's set a specific time so we know what to look for
    const date = new Date('2023-01-01T14:30:45');
    vi.setSystemTime(date);

    renderWidget(createWidget({ showSeconds: false, format24: true }));

    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.queryByText('45')).not.toBeInTheDocument();
  });

  it('applies theme color', () => {
    const widget = createWidget({ themeColor: 'rgb(255, 0, 0)' });
    renderWidget(widget);

    const timeContainer = screen.getByTestId('clock-time-container');
    expect(timeContainer).toHaveStyle({ color: 'rgb(255, 0, 0)' });
  });

  it('renders with lcd style', () => {
    const widget = createWidget({ clockStyle: 'lcd' });
    renderWidget(widget);

    const lcdBackground = screen.getByTestId('clock-lcd-background');
    expect(lcdBackground).toBeInTheDocument();
    expect(screen.getAllByText('88').length).toBeGreaterThan(0);
  });

  it('renders with minimal style', () => {
    const widget = createWidget({ clockStyle: 'minimal' });
    renderWidget(widget);

    const timeContainer = screen.getByTestId('clock-time-container');
    expect(timeContainer.className).not.toContain('animate-pulse');
  });

  it('renders with specific font family', () => {
    const widget = createWidget({ fontFamily: 'font-mono' });
    renderWidget(widget);

    const timeContainer = screen.getByTestId('clock-time-container');
    expect(timeContainer.className).toContain('font-mono');
  });

  // De-emphasized clock elements (colon separators, seconds, AM/PM, date) must
  // stay above WCAG AA on a projector. They previously used opacity-30/40/60,
  // which dropped legibility too far; guard against regressing below those
  // raised floors.
  it('keeps de-emphasized elements above the low-contrast opacity floor', () => {
    const date = new Date('2023-01-01T14:30:45');
    vi.setSystemTime(date);

    renderWidget(createWidget({ format24: true, showSeconds: true }));

    // Colon separators — raised from opacity-30 to opacity-60.
    const colons = screen.getAllByText(':');
    expect(colons.length).toBeGreaterThan(0);
    colons.forEach((colon) => {
      expect(colon.className).toContain('opacity-60');
      expect(colon.className).not.toContain('opacity-30');
    });

    // Seconds — raised from opacity-60 to opacity-80.
    const seconds = screen.getByText('45');
    expect(seconds.className).toContain('opacity-80');
  });

  // Seconds are rendered slightly smaller than the main time (em-based so they
  // scale with it), but were bumped up from 0.7em to 0.85em for distance
  // legibility on a projector. Guard against regressing back below that.
  it('renders seconds at a glanceable relative size', () => {
    const date = new Date('2023-01-01T14:30:45');
    vi.setSystemTime(date);

    renderWidget(createWidget({ format24: true, showSeconds: true }));

    const seconds = screen.getByText('45');
    expect(seconds).toHaveStyle({ fontSize: '0.85em' });
  });

  // Perf: when seconds aren't displayed, nothing on screen changes between
  // minute boundaries, so a 1s tick just burns CPU/battery on an always-on
  // classroom display for 59 out of every 60 renders. The widget should
  // coalesce onto a minute-aligned schedule instead of ticking every second.
  //
  // Timers are advanced ONE SECOND AT A TIME, each in its own act(), because
  // vi.advanceTimersByTime(60_000) fires all 60 setInterval callbacks inside
  // a single synchronous flush — React 18's automatic batching then collapses
  // every setState from that flush into one commit regardless of how many
  // times setInterval actually fired, which would hide the bug entirely. In
  // production each tick is its own macrotask (no batching across ticks), so
  // one act() per simulated second reproduces that fairly.
  it('does not commit every second when seconds are hidden (perf)', () => {
    const date = new Date('2023-01-01T14:30:00.000');
    vi.setSystemTime(date);

    let commitCount = 0;
    const onRender: ProfilerOnRenderCallback = () => {
      commitCount++;
    };

    render(
      <Profiler id="clock-no-seconds" onRender={onRender}>
        <ClockWidget widget={createWidget({ showSeconds: false })} />
      </Profiler>
    );
    commitCount = 0; // ignore the mount commit

    for (let i = 0; i < 60; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    // A full minute of 1s ticks passed with no seconds displayed: at most
    // one re-render (the minute rollover), not ~60.
    expect(commitCount).toBeLessThanOrEqual(1);
  });

  it('still updates every second when seconds are shown (sibling branch)', () => {
    const date = new Date('2023-01-01T14:30:00.000');
    vi.setSystemTime(date);

    let commitCount = 0;
    const onRender: ProfilerOnRenderCallback = () => {
      commitCount++;
    };

    render(
      <Profiler id="clock-with-seconds" onRender={onRender}>
        <ClockWidget widget={createWidget({ showSeconds: true })} />
      </Profiler>
    );
    commitCount = 0;

    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    // 5 whole seconds elapsed — still ticks every second in this mode.
    expect(commitCount).toBe(5);
  });

  it('displays the correct minute after a minute rolls over with seconds hidden', () => {
    const date = new Date('2023-01-01T14:30:45.000');
    vi.setSystemTime(date);

    renderWidget(createWidget({ showSeconds: false, format24: true }));
    expect(screen.getByText('30')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(15_000); // 14:30:45 -> 14:31:00
    });

    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('switches from per-second to minute-aligned ticking when showSeconds toggles off', () => {
    const date = new Date('2023-01-01T14:30:00.000');
    vi.setSystemTime(date);

    let commitCount = 0;
    const onRender: ProfilerOnRenderCallback = () => {
      commitCount++;
    };
    const { rerender } = render(
      <Profiler id="clock-toggle" onRender={onRender}>
        <ClockWidget widget={createWidget({ showSeconds: true })} />
      </Profiler>
    );
    rerender(
      <Profiler id="clock-toggle" onRender={onRender}>
        <ClockWidget widget={createWidget({ showSeconds: false })} />
      </Profiler>
    );
    commitCount = 0;

    for (let i = 0; i < 59; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    // Still within the same minute after the toggle: the old 1s interval
    // must have been torn down, not left running alongside the new one.
    expect(commitCount).toBe(0);
  });

  it('syncs the displayed minute immediately when toggling to seconds-hidden right after a minute rollover', () => {
    vi.setSystemTime(new Date('2023-01-01T14:30:59.900'));

    const { rerender } = render(
      <ClockWidget widget={createWidget({ showSeconds: true })} />
    );
    expect(screen.getByText('30')).toBeInTheDocument();

    // Crosses into the next minute before the toggle, but before the old
    // 1s interval's next tick would have fired on its own.
    vi.setSystemTime(new Date('2023-01-01T14:31:00.050'));
    rerender(<ClockWidget widget={createWidget({ showSeconds: false })} />);

    // The toggle must resync the display immediately, not leave the stale
    // pre-toggle minute on screen until the next 60s-aligned tick.
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  // A free-running setInterval(60_000) never realigns: event-loop delay and
  // background-tab throttling shift its phase off the minute boundary
  // permanently, so an always-on display drifts further behind the wall clock
  // the longer it runs. Each tick must re-derive its delay from Date.now().
  it('re-derives the minute delay from the wall clock on every tick', () => {
    vi.setSystemTime(new Date('2023-01-01T14:30:20.000'));
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    renderWidget(createWidget({ showSeconds: false, format24: true }));

    // Aligns to the boundary 40s out rather than waiting a full period.
    expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBe(40_000);

    for (let minute = 31; minute <= 33; minute++) {
      const scheduledBefore = setTimeoutSpy.mock.calls.length;
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByText(String(minute))).toBeInTheDocument();
      // Each tick schedules the next one afresh rather than free-running, so a
      // late-firing tick pulls the schedule back onto the boundary.
      expect(setTimeoutSpy.mock.calls.length).toBe(scheduledBefore + 1);
    }

    // A fixed-period interval is exactly what can't self-correct.
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('keeps the AM/PM label above the low-contrast opacity floor', () => {
    const date = new Date('2023-01-01T14:30:45');
    vi.setSystemTime(date);

    renderWidget(createWidget({ format24: false }));

    // AM/PM — raised from opacity-40 to opacity-70.
    const ampm = screen.getByText('PM');
    expect(ampm.className).toContain('opacity-70');
    expect(ampm.className).not.toContain('opacity-40');
  });

  // Regression: font-size formulas must use cqmin (not cqh or cqw separately).
  // cqh/cqw formulas like `min(82cqh, 20cqw)` break at non-default aspect ratios:
  // a very tall narrow clock (200×400) gives `min(328px, 40px) = 40px` (10% of
  // height — near-invisible); a very wide clock (800×100) gives `min(82px, 160px)
  // = 82px` (82% of height — overflows into the date row). cqmin scales both axes
  // symmetrically: `40cqmin` = 40% of the smaller dimension in all orientations.
  // Asserted against the exported formula directly — jsdom drops min()/clamp() font-size from the rendered DOM.
  it('time display uses cqmin units for font scaling (not cqh/cqw)', () => {
    const fontSize = getClockTimeFontSize(true);
    expect(fontSize).not.toMatch(/cqh/);
    expect(fontSize).not.toMatch(/cqw/);
    expect(fontSize).toMatch(/cqmin/);
  });

  it('time display uses cqmin units in no-seconds path', () => {
    const fontSize = getClockTimeFontSize(false);
    expect(fontSize).not.toMatch(/cqh/);
    expect(fontSize).not.toMatch(/cqw/);
    expect(fontSize).toMatch(/cqmin/);
  });

  it('date label uses cqmin units for font scaling (not cqh/cqw)', () => {
    const fontSize = CLOCK_DATE_FONT_SIZE;
    expect(fontSize).not.toMatch(/cqh/);
    expect(fontSize).not.toMatch(/cqw/);
    expect(fontSize).toMatch(/cqmin/);
  });

  // Regression: the date label must use the muted-text-on-dark-surface classes
  // from CLAUDE.md (text-slate-300 body / text-slate-200 heading), never a
  // near-black literal like text-slate-900 which is dark-on-dark on the app's
  // slate-900 dashboard background and fails WCAG AA.
  it('date label uses a WCAG-AA-safe muted text class on the dark dashboard surface', () => {
    renderWidget(createWidget());

    const dateLabel = screen.getByTestId('clock-date');
    expect(dateLabel.className).not.toContain('text-slate-900');
    expect(dateLabel.className).not.toContain('text-slate-800');
    expect(dateLabel.className).toMatch(/text-slate-(200|300)/);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, ClockConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { ClockWidget } from './Widget';

vi.mock('@/context/useDashboard');

const mockDashboardContext = {
  activeDashboard: {
    globalStyle: DEFAULT_GLOBAL_STYLE,
  },
};

// Helper to render widget
const renderWidget = (widget: WidgetData) => {
  return render(<ClockWidget widget={widget} />);
};

describe('ClockWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
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

  it('keeps the AM/PM label above the low-contrast opacity floor', () => {
    const date = new Date('2023-01-01T14:30:45');
    vi.setSystemTime(date);

    renderWidget(createWidget({ format24: false }));

    // AM/PM — raised from opacity-40 to opacity-70.
    const ampm = screen.getByText('PM');
    expect(ampm.className).toContain('opacity-70');
    expect(ampm.className).not.toContain('opacity-40');
  });
});

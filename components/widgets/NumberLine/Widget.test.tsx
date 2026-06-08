import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NumberLineWidget } from './Widget';
import { WidgetData } from '@/types';
import * as DashboardContext from '@/context/useDashboard';

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const baseWidget: WidgetData = {
  id: 'test-widget-1',
  type: 'numberLine',
  x: 0,
  y: 0,
  w: 700,
  h: 200,
  z: 1,
  flipped: false,
  config: {
    min: -10,
    max: 10,
    step: 1,
    displayMode: 'integers',
    showArrows: true,
    markers: [],
    jumps: [],
  },
};

const defaultDashboardMock = {
  activeDashboard: { id: 'dash-1', widgets: [] },
  dashboards: [],
  updateWidget: vi.fn(),
  addWidget: vi.fn(),
  removeWidget: vi.fn(),
  setDashboards: vi.fn(),
  setActiveDashboardId: vi.fn(),
  updateDashboardSettings: vi.fn(),
  hasWriteAccess: true,
  syncStatus: 'synced' as const,
  duplicateDashboard: vi.fn(),
  globalPermissions: [],
  lastLocalUpdateRef: { current: 0 },
} as unknown as ReturnType<typeof DashboardContext.useDashboard>;

describe('NumberLineWidget', () => {
  it('renders correctly without crashing', () => {
    vi.spyOn(DashboardContext, 'useDashboard').mockReturnValue(
      defaultDashboardMock
    );
    render(<NumberLineWidget widget={baseWidget} />);
    expect(
      screen.getByRole('img', { name: /Number line from -10 to 10/i })
    ).toBeInTheDocument();
  });

  it('renders endpoints correctly even if step does not perfectly align', () => {
    vi.spyOn(DashboardContext, 'useDashboard').mockReturnValue(
      defaultDashboardMock
    );

    // Test that tick generation handles non-aligned steps
    const widget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        min: -10,
        max: 10,
        step: 3, // -10, -7, -4, -1, 2, 5, 8, ... and explicitly 10
        displayMode: 'integers',
        markers: [],
        jumps: [],
        showArrows: true,
      },
    };

    render(<NumberLineWidget widget={widget} />);

    // We expect the endpoints to be labeled
    expect(screen.getByText('-10')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('formats fractions correctly including negative numbers', () => {
    vi.spyOn(DashboardContext, 'useDashboard').mockReturnValue(
      defaultDashboardMock
    );

    const widget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        min: -1,
        max: 1,
        step: 0.25,
        displayMode: 'fractions',
        markers: [],
        jumps: [],
        showArrows: true,
      },
    };

    render(<NumberLineWidget widget={widget} />);

    // Check specific fraction formats for positives and negatives
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(screen.getByText('-1/4')).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('-3/4')).toBeInTheDocument();

    // Make sure endpoints and zero are formatted as wholes
    expect(screen.getAllByText('1')[0]).toBeInTheDocument(); // Can be multiple if other things match
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getAllByText('-1')[0]).toBeInTheDocument();
  });

  it('shows fraction labels for all tenths ticks when step=0.1 (floating-point epsilon guard)', () => {
    // step=0.1 causes floating-point accumulation: min + 3*0.1 = 0.30000000000000004.
    // Multiplying by denom=10 gives 3.0000000000000004, so (val*denom)%1 !== 0 with
    // strict equality — the affected ticks fall back to decimal labels ("0.3", "0.6",
    // "0.7") instead of fractional ones ("3/10", "6/10", "7/10"). The fix must use
    // an epsilon check so every tenth is consistently formatted as a fraction.
    vi.spyOn(DashboardContext, 'useDashboard').mockReturnValue(
      defaultDashboardMock
    );

    const widget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        min: 0,
        max: 1,
        step: 0.1,
        displayMode: 'fractions',
        markers: [],
        jumps: [],
        showArrows: true,
      },
    };

    render(<NumberLineWidget widget={widget} />);

    // All three ticks that fail with strict (val*denom)%1===0 must show as fractions.
    // Confirming all three together verifies the epsilon fix, not just one lucky tick.
    expect(screen.getByText('3/10')).toBeInTheDocument();
    expect(screen.getByText('6/10')).toBeInTheDocument();
    expect(screen.getByText('7/10')).toBeInTheDocument();
    // Sanity-check: non-problematic ticks still show correctly.
    expect(screen.getByText('1/10')).toBeInTheDocument();
    expect(screen.getByText('5/10')).toBeInTheDocument(); // fractionLabel does not simplify fractions
    // 0 and 1 are whole-number endpoints
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getAllByText('1')[0]).toBeInTheDocument();
  });

  it('shows clean labels in integers mode with decimal step (FP accumulation guard)', () => {
    // step=0.1 causes floating-point accumulation: 0 + 3×0.1 =
    // 0.30000000000000004. Without the toFixed(4) baseline, the default
    // val.toString() label path renders the raw FP artifact for the
    // 'integers' display mode — the same bug that was already fixed for
    // 'fractions' mode. This test confirms the fix covers all display modes.
    vi.spyOn(DashboardContext, 'useDashboard').mockReturnValue(
      defaultDashboardMock
    );

    const widget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        min: 0,
        max: 1,
        step: 0.1,
        displayMode: 'integers',
        markers: [],
        jumps: [],
        showArrows: true,
      },
    };

    render(<NumberLineWidget widget={widget} />);

    // These ticks accumulate FP error. The raw val.toString() produces
    // '0.30000000000000004', '0.6000000000000001', '0.7000000000000001'.
    // After the fix they must render as clean '0.3', '0.6', '0.7'.
    expect(screen.getByText('0.3')).toBeInTheDocument();
    expect(screen.getByText('0.6')).toBeInTheDocument();
    expect(screen.getByText('0.7')).toBeInTheDocument();

    // The raw FP-artifact strings must NOT appear as text nodes.
    expect(screen.queryByText('0.30000000000000004')).not.toBeInTheDocument();
    expect(screen.queryByText('0.6000000000000001')).not.toBeInTheDocument();
    expect(screen.queryByText('0.7000000000000001')).not.toBeInTheDocument();
  });

  it('caps number of ticks if range is too large compared to step', () => {
    vi.spyOn(DashboardContext, 'useDashboard').mockReturnValue(
      defaultDashboardMock
    );

    const widget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        min: -100,
        max: 100,
        step: 1,
        displayMode: 'integers',
        markers: [],
        jumps: [],
        showArrows: true,
      },
    };

    // This shouldn't crash or take an insane amount of time because of MAX_TICKS bounding
    render(<NumberLineWidget widget={widget} />);

    // The endpoints should still be there
    expect(screen.getByText('-100')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NumberLineWidget } from './Widget';
import { WidgetData } from '@/types';
import * as DashboardCanvasStore from '@/context/dashboardCanvasStore';

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

// NumberLineWidget only consumes updateWidget from useDashboardActions(); the
// mock mirrors exactly that to make the dependency explicit.
const defaultDashboardMock = {
  updateWidget: vi.fn(),
} as unknown as ReturnType<typeof DashboardCanvasStore.useDashboardActions>;

describe('NumberLineWidget', () => {
  it('renders correctly without crashing', () => {
    vi.spyOn(DashboardCanvasStore, 'useDashboardActions').mockReturnValue(
      defaultDashboardMock
    );
    render(<NumberLineWidget widget={baseWidget} />);
    expect(
      screen.getByRole('img', { name: /Number line from -10 to 10/i })
    ).toBeInTheDocument();
  });

  it('renders endpoints correctly even if step does not perfectly align', () => {
    vi.spyOn(DashboardCanvasStore, 'useDashboardActions').mockReturnValue(
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
    vi.spyOn(DashboardCanvasStore, 'useDashboardActions').mockReturnValue(
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
    vi.spyOn(DashboardCanvasStore, 'useDashboardActions').mockReturnValue(
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
    vi.spyOn(DashboardCanvasStore, 'useDashboardActions').mockReturnValue(
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
    vi.spyOn(DashboardCanvasStore, 'useDashboardActions').mockReturnValue(
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

  it('stores a clean marker value (no FP noise) when a tick is clicked', () => {
    // Root-cause: addMarker() passes the raw tick value (min + i * step) straight into
    // the marker object without rounding. For step=0.1, ticks at indices 3, 6, 7
    // accumulate floating-point error: 0 + 3×0.1 = 0.30000000000000004.
    // That raw value is persisted to Firestore AND rendered verbatim in the settings
    // panel (<div>{marker.value}</div>), so teachers see "0.30000000000000004".
    //
    // The fix must round marker.value to strip FP noise before storing, e.g.
    //   parseFloat(val.toFixed(10))
    // This is separate from the tick-label fix (which already uses toFixed(4) for display).
    const updateWidgetMock = vi.fn();
    vi.spyOn(DashboardCanvasStore, 'useDashboardActions').mockReturnValue({
      ...defaultDashboardMock,
      updateWidget: updateWidgetMock,
    });

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

    const { container } = render(<NumberLineWidget widget={widget} />);

    // Tick at index 3 renders at value 0 + 3×0.1 = 0.30000000000000004 (FP dirty).
    // The interaction rects are SVG <rect> elements with class "cursor-pointer".
    const rects = container.querySelectorAll('rect.cursor-pointer');
    // Expect one rect per tick (11 ticks for 0..1 with step=0.1).
    expect(rects.length).toBeGreaterThanOrEqual(11);

    fireEvent.click(rects[3]);

    expect(updateWidgetMock).toHaveBeenCalledOnce();
    const callArg = updateWidgetMock.mock.calls[0][1] as {
      config: { markers: { value: number }[] };
    };
    const storedValue = callArg.config.markers[0].value;

    // Must be exactly 0.3 — not the FP-dirty 0.30000000000000004.
    expect(storedValue).toBe(0.3);
    expect(storedValue.toString()).toBe('0.3');
  });
});

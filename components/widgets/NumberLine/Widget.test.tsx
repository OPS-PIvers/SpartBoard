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

  it('caps number of ticks if range is too large compared to step', () => {
    vi.spyOn(DashboardContext, 'useDashboard').mockReturnValue(
      defaultDashboardMock
    );

    const widget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        min: -10000,
        max: 10000,
        step: 0.01,
        displayMode: 'integers',
        markers: [],
        jumps: [],
        showArrows: true,
      },
    };

    // This shouldn't crash or take an insane amount of time because of MAX_TICKS bounding
    render(<NumberLineWidget widget={widget} />);

    // The endpoints should still be there
    expect(screen.getByText('-10000')).toBeInTheDocument();
    expect(screen.getByText('10000')).toBeInTheDocument();
  });
});

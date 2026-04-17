import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WidgetData, SeatingChartConfig } from '@/types';

const mockUpdateWidget = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: mockUpdateWidget,
    rosters: [],
    activeRosterId: null,
    addToast: vi.fn(),
    activeDashboard: { widgets: [] },
  }),
}));

// Mock heavy sub-components so the test is hermetic and fast. The toolbar mock
// exposes the `setMode` callback via buttons so tests can toggle the widget
// between assign/setup modes and verify the correct empty state renders.
vi.mock('@/components/widgets/SeatingChart/SeatingChartToolbar', () => ({
  SeatingChartToolbar: ({
    setMode,
  }: {
    setMode: (mode: 'setup' | 'assign' | 'interact') => void;
  }) => (
    <div data-testid="toolbar-mock">
      <button onClick={() => setMode('setup')}>set-setup</button>
      <button onClick={() => setMode('assign')}>set-assign</button>
      <button onClick={() => setMode('interact')}>set-interact</button>
    </div>
  ),
}));

vi.mock('@/components/widgets/SeatingChart/SeatingChartSidebar', () => ({
  SeatingChartSidebar: () => <div data-testid="sidebar-mock" />,
}));

vi.mock('@/components/widgets/SeatingChart/FurnitureItemRenderer', () => ({
  FurnitureItemRenderer: ({ item }: { item: { id: string } }) => (
    <div data-testid={`furniture-${item.id}`} />
  ),
}));

import { SeatingChartWidget } from '@/components/widgets/SeatingChart/Widget';

const makeWidget = (
  overrides: Partial<SeatingChartConfig> = {}
): WidgetData => ({
  id: 'seating-1',
  type: 'seating-chart',
  x: 0,
  y: 0,
  w: 600,
  h: 500,
  z: 1,
  flipped: false,
  config: {
    furniture: [],
    assignments: {},
    gridSize: 20,
    template: 'freeform',
    ...overrides,
  } as SeatingChartConfig,
});

describe('SeatingChartWidget empty states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Empty Classroom" empty state in non-setup mode (default: interact)', () => {
    render(<SeatingChartWidget widget={makeWidget()} />);
    const emptyState = screen.getByTestId('seating-chart-empty-assign');
    expect(within(emptyState).getByText('Empty Classroom')).toBeInTheDocument();
    expect(
      within(emptyState).getByText('Switch to "Setup" to arrange furniture.')
    ).toBeInTheDocument();
    // The setup empty state must NOT be present in non-setup mode.
    expect(
      screen.queryByTestId('seating-chart-empty-setup')
    ).not.toBeInTheDocument();
  });

  it('renders the freeform "No Furniture" empty state in setup mode when template is freeform', () => {
    render(
      <SeatingChartWidget widget={makeWidget({ template: 'freeform' })} />
    );
    fireEvent.click(screen.getByText('set-setup'));

    const emptyState = screen.getByTestId('seating-chart-empty-setup');
    expect(within(emptyState).getByText('No Furniture')).toBeInTheDocument();
    // i18n subtitle for freeform template comes from
    // widgets.seatingChart.emptyStateFreeform.
    expect(
      within(emptyState).getByText('Add furniture from the sidebar.')
    ).toBeInTheDocument();
    // The non-setup empty state must NOT render at the same time.
    expect(
      screen.queryByTestId('seating-chart-empty-assign')
    ).not.toBeInTheDocument();
  });

  it('renders the templated "No Furniture" subtitle when template is not freeform', () => {
    render(<SeatingChartWidget widget={makeWidget({ template: 'rows' })} />);
    fireEvent.click(screen.getByText('set-setup'));

    const emptyState = screen.getByTestId('seating-chart-empty-setup');
    expect(within(emptyState).getByText('No Furniture')).toBeInTheDocument();
    // Template-flavored subtitle from widgets.seatingChart.emptyStateTemplate.
    expect(
      within(emptyState).getByText('Pick a template and click Apply Layout.')
    ).toBeInTheDocument();
  });

  it('does NOT render either empty state when furniture exists', () => {
    const widgetWithFurniture = makeWidget({
      furniture: [
        {
          id: 'desk-1',
          type: 'desk' as const,
          x: 10,
          y: 10,
          width: 60,
          height: 40,
          rotation: 0,
        },
      ],
    });
    render(<SeatingChartWidget widget={widgetWithFurniture} />);

    expect(
      screen.queryByTestId('seating-chart-empty-assign')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('seating-chart-empty-setup')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Empty Classroom')).not.toBeInTheDocument();
    expect(screen.queryByText('No Furniture')).not.toBeInTheDocument();
  });

  it('empty-state wrapper is pointer-events-none so it does not block canvas interaction', () => {
    render(<SeatingChartWidget widget={makeWidget()} />);
    const emptyState = screen.getByTestId('seating-chart-empty-assign');
    expect(emptyState).toHaveClass('pointer-events-none');
  });

  it('uses the ScaledEmptyState primitive (no legacy hardcoded size classes on the text nodes)', () => {
    render(<SeatingChartWidget widget={makeWidget()} />);
    const title = screen.getByText('Empty Classroom');
    const subtitle = screen.getByText(
      'Switch to "Setup" to arrange furniture.'
    );

    // Guard against the hand-rolled pattern sneaking back in. The old empty
    // state put `text-sm` on the title and `text-xs` on the subtitle; the
    // ScaledEmptyState primitive uses inline cqmin font sizing instead.
    expect(title).not.toHaveClass('text-sm');
    expect(subtitle).not.toHaveClass('text-xs');

    // ScaledEmptyState emits uppercase/tracked title styling.
    expect(title).toHaveClass('uppercase', 'tracking-widest');
  });
});

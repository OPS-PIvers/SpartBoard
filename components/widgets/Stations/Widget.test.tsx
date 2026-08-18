import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { StationsWidget } from './Widget';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, StationsConfig } from '@/types';
import { mockPointerEvent } from '@/tests/testHelpers/mocks';

vi.mock('@/context/useDashboard');

const mockDashboardContext = {
  updateWidget: vi.fn(),
  addToast: vi.fn(),
  rosters: [
    {
      id: 'roster-1',
      name: 'Class 1A',
      students: [
        { id: 's1', firstName: 'John', lastName: 'Doe' },
        { id: 's2', firstName: 'Jane', lastName: 'Smith' },
      ],
    },
  ],
  activeRosterId: 'roster-1',
  activeDashboard: { widgets: [{ id: 'stations-1' }] },
};

describe('StationsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
    if (!global.PointerEvent) {
      global.PointerEvent = mockPointerEvent();
    }
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createWidget = (config: Partial<StationsConfig> = {}): WidgetData => {
    return {
      id: 'stations-1',
      type: 'stations',
      x: 0,
      y: 0,
      w: 600,
      h: 420,
      z: 1,
      config: {
        rosterMode: 'class',
        assignments: {},
        stations: [
          { id: 'st-a', title: 'Reading', color: '#10b981', order: 0 },
          { id: 'st-b', title: 'Math', color: '#f59e0b', order: 1 },
        ],
        ...config,
      },
    } as WidgetData;
  };

  it('keeps two same-name students independently assigned (no name-collision)', async () => {
    // Regression test: assignments must be keyed by the roster student `id`,
    // not the display name. Two students who share a name (e.g. two "Emma
    // Smith"s) previously collided on the same `assignments` key, so
    // assigning one to a station silently placed/overwrote the other's
    // station too.
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      rosters: [
        {
          id: 'roster-1',
          name: 'Class 1A',
          students: [
            { id: 's1', firstName: 'Emma', lastName: 'Smith' },
            { id: 's2', firstName: 'Emma', lastName: 'Smith' },
          ],
        },
      ],
    });

    const widget = createWidget({
      assignments: { s1: 'st-a', s2: 'st-b' },
    });

    render(<StationsWidget widget={widget} />);

    const chips = await screen.findAllByText('Emma Smith');
    expect(chips).toHaveLength(2);

    const readingZone = screen.getByTestId('station-zone-st-a');
    const mathZone = screen.getByTestId('station-zone-st-b');

    expect(within(readingZone).getAllByText('Emma Smith')).toHaveLength(1);
    expect(within(mathZone).getAllByText('Emma Smith')).toHaveLength(1);
  });

  it('still honors a legacy name-keyed assignment (e.g. from Randomizer or pre-fix data)', async () => {
    // Regression test: assignments sent over from the Randomizer's
    // "Send Groups -> Stations" button (nexus.ts) — and dashboards saved
    // before assignments were id-keyed — store the entry under the display
    // name instead of the roster id. The widget must still honor it when no
    // id-keyed entry exists.
    const widget = createWidget({
      assignments: { 'John Doe': 'st-a' },
    });

    render(<StationsWidget widget={widget} />);

    const readingZone = screen.getByTestId('station-zone-st-a');
    expect(
      await within(readingZone).findByText('John Doe')
    ).toBeInTheDocument();
  });

  it('can unassign a student whose assignment only exists under the legacy name key', async () => {
    const widget = createWidget({
      assignments: { 'John Doe': 'st-a' },
    });

    render(<StationsWidget widget={widget} />);

    const chip = await screen.findByText('John Doe');
    fireEvent.click(chip);

    const [, updatePayload] = mockDashboardContext.updateWidget.mock.calls.at(
      -1
    ) as [string, { config: StationsConfig }];
    expect(updatePayload.config.assignments).not.toHaveProperty('John Doe');
    expect(updatePayload.config.assignments.s1).toBeNull();
  });

  it('persists an assignment write for custom-roster students (id equals name in custom mode)', async () => {
    const widget = createWidget({
      rosterMode: 'custom',
      customRoster: ['Alex Kim'],
      assignments: { 'Alex Kim': 'st-a' },
    });

    render(<StationsWidget widget={widget} />);

    const chip = await screen.findByText('Alex Kim');
    fireEvent.click(chip);

    const [, updatePayload] = mockDashboardContext.updateWidget.mock.calls.at(
      -1
    ) as [string, { config: StationsConfig }];
    expect(updatePayload.config.assignments).toHaveProperty('Alex Kim', null);
  });

  it('coalesces a legacy name-keyed entry when Rotate touches it (not just drag/click)', async () => {
    const widget = createWidget({
      assignments: { 'John Doe': 'st-a' },
    });

    render(<StationsWidget widget={widget} />);
    await screen.findByText('John Doe');

    fireEvent.click(screen.getByTitle('Rotate clockwise'));

    const [, updatePayload] = mockDashboardContext.updateWidget.mock.calls.at(
      -1
    ) as [string, { config: StationsConfig }];
    // Rotated from st-a to st-b, and re-keyed to the roster id in the same write.
    expect(updatePayload.config.assignments).not.toHaveProperty('John Doe');
    expect(updatePayload.config.assignments.s1).toBe('st-b');
  });

  it('coalesces a legacy name-keyed entry when Reset Station touches it', async () => {
    const widget = createWidget({
      assignments: { 'John Doe': 'st-a' },
    });

    render(<StationsWidget widget={widget} />);
    await screen.findByText('John Doe');

    fireEvent.click(screen.getByTitle('Reset students in Reading'));

    const [, updatePayload] = mockDashboardContext.updateWidget.mock.calls.at(
      -1
    ) as [string, { config: StationsConfig }];
    expect(updatePayload.config.assignments).not.toHaveProperty('John Doe');
    expect(updatePayload.config.assignments.s1).toBeNull();
  });

  it('pins the duplicate-name migration outcome: one shared legacy key resolves to exactly one roster student', () => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      rosters: [
        {
          id: 'roster-1',
          name: 'Class 1A',
          students: [
            { id: 's1', firstName: 'Emma', lastName: 'Smith' },
            { id: 's2', firstName: 'Emma', lastName: 'Smith' },
          ],
        },
      ],
    });

    const widget = createWidget({
      assignments: { 'Emma Smith': 'st-a' },
    });

    render(<StationsWidget widget={widget} />);

    // Before any write, the legacy key resolves for BOTH same-named students.
    const readingZone = screen.getByTestId('station-zone-st-a');
    expect(within(readingZone).getAllByText('Emma Smith')).toHaveLength(2);

    // Unassigning the first-rendered chip (roster order: s1 first) triggers
    // the write that migrates/collapses the shared legacy key.
    fireEvent.click(within(readingZone).getAllByText('Emma Smith')[0]);

    const [, updatePayload] = mockDashboardContext.updateWidget.mock.calls.at(
      -1
    ) as [string, { config: StationsConfig }];
    expect(updatePayload.config.assignments).not.toHaveProperty('Emma Smith');
    // s1 (first-iterated) deterministically wins the migration and is
    // explicitly unassigned by this click; s2 has no entry at all (the
    // ambiguous legacy value could not be attributed to it) and falls back
    // to the unassigned bucket rather than silently double-counting toward
    // station capacity.
    expect(updatePayload.config.assignments.s1).toBeNull();
    expect(updatePayload.config.assignments).not.toHaveProperty('s2');
  });
});

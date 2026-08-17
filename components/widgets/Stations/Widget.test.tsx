import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
      w: 500,
      h: 400,
      z: 1,
      config: {
        rosterMode: 'class',
        assignments: {},
        stations: [
          { id: 'station-a', title: 'Station A', color: '#10b981', order: 0 },
          { id: 'station-b', title: 'Station B', color: '#3b82f6', order: 1 },
        ],
        ...config,
      },
    } as WidgetData;
  };

  it('keeps two same-name students independently assigned (no name-collision)', async () => {
    // Regression test: assignments must be keyed by the roster student `id`,
    // not the display name. Two students who share a name (e.g. two "Emma
    // Smith"s) previously collided on the same `assignments` key, so an
    // id-keyed assignment map like this one was never read at all and both
    // students silently fell back to "unassigned" no matter what the config
    // said. Each station's count badge (`aria-label="N students assigned..."`)
    // must show exactly one member per station, with nobody left unassigned.
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
      assignments: { s1: 'station-a', s2: 'station-b' },
    });

    render(<StationsWidget widget={widget} />);

    expect(await screen.findAllByText('Emma Smith')).toHaveLength(2);
    expect(screen.getAllByLabelText('1 students assigned')).toHaveLength(2);
    expect(screen.getByText('Unassigned (0)')).toBeInTheDocument();
  });

  it('still honors a legacy name-keyed assignment saved before the id-keying fix', async () => {
    // Regression test: dashboards saved before assignments were keyed by
    // student id (and station names imported via the Randomizer nexus, which
    // has no student ids) store the assignment under the display name
    // instead (e.g. "John Doe": "station-a"). The widget must still honor a
    // name-keyed entry when no id-keyed one exists rather than treating the
    // student as unassigned.
    const widget = createWidget({
      assignments: { 'John Doe': 'station-a' },
    });

    render(<StationsWidget widget={widget} />);

    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    // Only John Doe has an assignment (legacy-name-keyed); Jane Smith (the
    // other default roster member) has none and stays unassigned.
    expect(screen.getByLabelText('1 students assigned')).toBeInTheDocument();
    expect(screen.getByText('Unassigned (1)')).toBeInTheDocument();
  });

  it('can unassign a student whose assignment only exists under the legacy name key', async () => {
    // Regression test: the read-path fallback (previous test) keeps legacy
    // assignments visible, but a write path that only ever deletes
    // `assignments[id]` is a no-op when the entry lives under the name key —
    // so a legacy-keyed student could never actually be unassigned by click.
    const widget = createWidget({
      assignments: { 'John Doe': 'station-a' },
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
});

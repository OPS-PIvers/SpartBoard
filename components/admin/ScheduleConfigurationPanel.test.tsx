import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScheduleConfigurationPanel } from './ScheduleConfigurationPanel';
import { ScheduleGlobalConfig } from '@/types';
import type { Building } from '@/config/buildings';

// The panel reads its building list from `useAdminBuildings()`, which returns
// `[]` for a no-org/provider-less render. An admin always has an org in real
// usage, so mock the hook to supply the building list the panel renders.
// It can also return a legacy long-form building doc id (e.g.
// `orono-high-school`) when an org's building record predates the short-id
// migration — see config/buildings.ts's BUILDING_ID_ALIASES.
const mockUseAdminBuildings = vi.fn<() => Building[]>(() => [
  { id: 'b1', name: 'Building 1', gradeLevels: [], gradeLabel: '' },
  { id: 'b2', name: 'Building 2', gradeLevels: [], gradeLabel: '' },
]);
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

const flags = vi.hoisted(() => ({ perPeriod: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: (f: string) =>
      f === 'per-period-access' && flags.perPeriod,
  }),
}));

describe('ScheduleConfigurationPanel', () => {
  const mockConfig: ScheduleGlobalConfig = {
    buildingDefaults: {
      b1: {
        buildingId: 'b1',
        items: [],
        schedules: [
          {
            id: 's1',
            name: 'Test Schedule',
            items: [
              {
                id: 'item1',
                task: 'Task 1',
                startTime: '09:00',
                endTime: '10:00',
                mode: 'clock',
              },
            ],
            days: [1, 2],
          },
        ],
      },
    },
  };

  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockUseAdminBuildings.mockReturnValue([
      { id: 'b1', name: 'Building 1', gradeLevels: [], gradeLabel: '' },
      { id: 'b2', name: 'Building 2', gradeLevels: [], gradeLabel: '' },
    ]);
  });

  it('renders correctly with initial config', () => {
    render(
      <ScheduleConfigurationPanel config={mockConfig} onChange={mockOnChange} />
    );

    expect(screen.getByText('Building Schedules')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Schedule')).toBeInTheDocument();
  });

  it('adds a new schedule', () => {
    render(
      <ScheduleConfigurationPanel config={mockConfig} onChange={mockOnChange} />
    );

    const addScheduleButton = screen.getByText('Add Schedule');
    fireEvent.click(addScheduleButton);

    expect(mockOnChange).toHaveBeenCalled();
    const lastCall = mockOnChange.mock.calls[0][0] as ScheduleGlobalConfig;
    expect(lastCall.buildingDefaults.b1.schedules).toHaveLength(2);
    expect(lastCall.buildingDefaults.b1.schedules?.[1].name).toBe(
      'New Schedule'
    );
  });

  it('edits a schedule and adds an item', () => {
    render(
      <ScheduleConfigurationPanel config={mockConfig} onChange={mockOnChange} />
    );

    // Click Edit Items (Pencil icon inside button with title "Edit items")
    const editButton = screen.getByTitle('Edit items');
    fireEvent.click(editButton);

    // Now we should be in the items view
    expect(screen.getByDisplayValue('Test Schedule')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Task 1')).toBeInTheDocument();

    const addEventButton = screen.getByText('Add Event');
    fireEvent.click(addEventButton);

    expect(mockOnChange).toHaveBeenCalled();
    const lastCall = mockOnChange.mock.calls[0][0] as ScheduleGlobalConfig;
    const testSchedule = lastCall.buildingDefaults.b1.schedules?.[0];
    expect(testSchedule?.items).toHaveLength(2);
    // items are now appended to the end to respect manual ordering
    expect(testSchedule?.items[1].task).toBe('New Task');
  });

  it('sorts items by time when Sort button is clicked', () => {
    const StatefulWrapper = () => {
      const [config, setConfig] = useState(mockConfig);
      return (
        <ScheduleConfigurationPanel
          config={config}
          onChange={(newConfig) => {
            setConfig(newConfig);
            mockOnChange(newConfig);
          }}
        />
      );
    };

    render(<StatefulWrapper />);

    // Enter edit view
    fireEvent.click(screen.getByTitle('Edit items'));

    // Add a new event (default 08:00)
    fireEvent.click(screen.getByText('Add Event'));

    // Current order should have Task 1 (09:00) first, then New Task (08:00)
    // because we removed auto-sort on add
    expect(screen.getAllByDisplayValue(/Task/)[0]).toHaveValue('Task 1');
    expect(screen.getAllByDisplayValue(/Task/)[1]).toHaveValue('New Task');

    // Click Sort
    fireEvent.click(screen.getByText('Sort'));

    // After sort: New Task (08:00) should be first
    const inputs = screen.getAllByDisplayValue(/Task/);
    expect(inputs[0]).toHaveValue('New Task');
    expect(inputs[1]).toHaveValue('Task 1');
  });

  it('switches buildings', () => {
    render(
      <ScheduleConfigurationPanel config={mockConfig} onChange={mockOnChange} />
    );

    const b2Button = screen.getByText('Building 2');
    fireEvent.click(b2Button);

    expect(
      screen.getByText((_content, element) => {
        const hasText = (node: Element) =>
          node.textContent ===
          'Users in Building 2 will be able to copy these default schedules to their dashboard.';
        const nodeHasText = element ? hasText(element) : false;
        const childrenDontHaveText = Array.from(element?.children ?? []).every(
          (child) => !hasText(child)
        );
        return nodeHasText && childrenDontHaveText;
      })
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Test Schedule')).not.toBeInTheDocument();
  });

  it('finds buildingDefaults saved under the canonical id when the org building record resolves to a legacy raw id', () => {
    // Saved config is canonically keyed ('high'), but this org's building
    // doc still resolves to the legacy long-form id.
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'orono-high-school',
        name: 'Orono High',
        gradeLevels: [],
        gradeLabel: '',
      },
    ]);

    const config: ScheduleGlobalConfig = {
      buildingDefaults: {
        high: {
          buildingId: 'high',
          items: [],
          schedules: [
            { id: 's1', name: 'Legacy-Keyed Schedule', items: [], days: [] },
          ],
        },
      },
    };

    render(
      <ScheduleConfigurationPanel config={config} onChange={mockOnChange} />
    );

    // If the lookup missed (raw-id bug), the saved schedule would be invisible.
    expect(
      screen.getByDisplayValue('Legacy-Keyed Schedule')
    ).toBeInTheDocument();
  });

  it('saves building defaults under the canonical building id, not the legacy raw id', () => {
    mockUseAdminBuildings.mockReturnValue([
      {
        id: 'orono-high-school',
        name: 'Orono High',
        gradeLevels: [],
        gradeLabel: '',
      },
    ]);

    const config: ScheduleGlobalConfig = { buildingDefaults: {} };

    render(
      <ScheduleConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.click(screen.getByText('Add Schedule'));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const updated = mockOnChange.mock.calls[0][0] as ScheduleGlobalConfig;
    expect(updated.buildingDefaults.high?.schedules).toHaveLength(1);
    expect(updated.buildingDefaults['orono-high-school']).toBeUndefined();
  });

  describe('per-period access fields', () => {
    beforeEach(() => {
      flags.perPeriod = true;
    });
    afterEach(() => {
      flags.perPeriod = false;
    });

    it('hides the period fields while the flag is off', () => {
      flags.perPeriod = false;
      render(
        <ScheduleConfigurationPanel
          config={mockConfig}
          onChange={mockOnChange}
        />
      );
      expect(screen.queryByText('Special days')).toBeNull();
    });

    it('marks an item as a class period by giving it an id', () => {
      render(
        <ScheduleConfigurationPanel
          config={mockConfig}
          onChange={mockOnChange}
        />
      );
      fireEvent.click(screen.getByTitle('Edit items'));
      fireEvent.change(screen.getByLabelText('Class period id for Task 1'), {
        target: { value: ' P3 ' },
      });
      const next = mockOnChange.mock.calls.at(-1)?.[0] as ScheduleGlobalConfig;
      expect(next.buildingDefaults.b1.schedules?.[0].items[0]).toMatchObject({
        periodId: 'P3',
        isClassPeriod: true,
      });
    });

    it('adds a special day pointing at a schedule', () => {
      render(
        <ScheduleConfigurationPanel
          config={mockConfig}
          onChange={mockOnChange}
        />
      );
      fireEvent.change(screen.getByLabelText('Special day date'), {
        target: { value: '2026-10-02' },
      });
      fireEvent.click(screen.getByText('Add special day'));
      const next = mockOnChange.mock.calls.at(-1)?.[0] as ScheduleGlobalConfig;
      expect(next.buildingDefaults.b1.dateOverrides).toEqual({
        '2026-10-02': 's1',
      });
    });
  });
});

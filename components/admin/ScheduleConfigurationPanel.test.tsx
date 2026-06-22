import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduleConfigurationPanel } from './ScheduleConfigurationPanel';
import { ScheduleGlobalConfig } from '@/types';

// The panel reads its building list from `useAdminBuildings()`, which returns
// `[]` for a no-org/provider-less render. An admin always has an org in real
// usage, so mock the hook to supply the building list the panel renders.
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'b1', name: 'Building 1', gradeLevels: [], gradeLabel: '' },
    { id: 'b2', name: 'Building 2', gradeLevels: [], gradeLabel: '' },
  ],
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
});

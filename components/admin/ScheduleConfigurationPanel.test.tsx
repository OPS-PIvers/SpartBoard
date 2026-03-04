import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScheduleConfigurationPanel } from './ScheduleConfigurationPanel';
import { ScheduleGlobalConfig } from '@/types';

// Mock BUILDINGS
vi.mock('@/config/buildings', () => ({
  BUILDINGS: [
    { id: 'b1', name: 'Building 1' },
    { id: 'b2', name: 'Building 2' },
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
    expect(screen.getByText('Test Schedule')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Task 1')).toBeInTheDocument();

    const addEventButton = screen.getByText('Add Event');
    fireEvent.click(addEventButton);

    expect(mockOnChange).toHaveBeenCalled();
    const lastCall = mockOnChange.mock.calls[0][0] as ScheduleGlobalConfig;
    const testSchedule = lastCall.buildingDefaults.b1.schedules?.[0];
    expect(testSchedule?.items).toHaveLength(2);
    // Since sortByTime is used, "New Task" at 08:00 should come before "Task 1" at 09:00
    expect(testSchedule?.items[0].task).toBe('New Task');
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

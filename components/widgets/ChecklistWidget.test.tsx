/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ChecklistSettings, ChecklistWidget } from './ChecklistWidget';
import { useDashboard } from '../../context/useDashboard';
import { DashboardContextValue } from '../../context/DashboardContextValue';
import {
  InstructionalRoutinesConfig,
  WidgetData,
  ChecklistConfig,
} from '../../types';

// Mock dependencies
vi.mock('../../context/useDashboard');
vi.mock('../common/RosterModeControl', () => ({
  RosterModeControl: () => <div data-testid="roster-mode-control" />,
}));
vi.mock('lucide-react', () => ({
  CheckSquare: () => <div data-testid="check-square" />,
  Square: () => <div data-testid="square" />,
  ListPlus: () => <div data-testid="list-plus" />,
  Type: () => <div />,
  Users: () => <div />,
  RefreshCw: () => <div />,
  BookOpen: () => <div />,
}));

const mockUpdateWidget = vi.fn();
const mockAddToast = vi.fn();

const mockWidget: WidgetData = {
  id: 'checklist-1',
  type: 'checklist',
  x: 0,
  y: 0,
  w: 4,
  h: 4,
  z: 1,
  flipped: true,
  config: {
    items: [],
    mode: 'manual',
    scaleMultiplier: 1,
  } as ChecklistConfig,
};

const mockRoutineWidget: WidgetData = {
  id: 'routine-1',
  type: 'instructionalRoutines',
  x: 0,
  y: 0,
  w: 4,
  h: 4,
  z: 1,
  flipped: false,
  config: {
    selectedRoutineId: 'routine-1',
    customSteps: [
      { id: 'step-1', text: 'Step 1' },
      { id: 'step-2', text: 'Step 2' },
    ],
  } as InstructionalRoutinesConfig,
};

const defaultContext: Partial<DashboardContextValue> = {
  updateWidget: mockUpdateWidget,
  addToast: mockAddToast,
  rosters: [],
  activeRosterId: null,
  activeDashboard: {
    id: 'dashboard-1',
    name: 'Test Dashboard',
    background: 'bg-slate-100',
    widgets: [mockWidget, mockRoutineWidget],
    globalStyle: {
      fontFamily: 'sans',
      windowTransparency: 0,
      windowBorderRadius: 'md',
      dockTransparency: 0,
      dockBorderRadius: 'md',
      dockTextColor: '#000000',
      dockTextShadow: false,
    },
    createdAt: Date.now(),
  },
};

describe('ChecklistWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as Mock).mockReturnValue(defaultContext);
  });

  it('renders empty state message when no items', () => {
    render(<ChecklistWidget widget={mockWidget} />);
    expect(screen.getByText('No Tasks')).toBeInTheDocument();
    expect(
      screen.getByText('Flip to add your class tasks.')
    ).toBeInTheDocument();
  });

  it('renders items in manual mode', () => {
    const itemsWidget = {
      ...mockWidget,
      config: {
        ...mockWidget.config,
        items: [
          { id: '1', text: 'Task 1', completed: false },
          { id: '2', text: 'Task 2', completed: true },
        ],
      } as ChecklistConfig,
    };
    render(<ChecklistWidget widget={itemsWidget} />);

    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    // One checked, one unchecked
    expect(screen.getByTestId('square')).toBeInTheDocument();
    expect(screen.getByTestId('check-square')).toBeInTheDocument();
  });

  it('toggles item completion on click', () => {
    const itemsWidget = {
      ...mockWidget,
      config: {
        ...mockWidget.config,
        items: [{ id: '1', text: 'Task 1', completed: false }],
      } as ChecklistConfig,
    };
    render(<ChecklistWidget widget={itemsWidget} />);

    fireEvent.click(screen.getByText('Task 1'));

    expect(mockUpdateWidget).toHaveBeenCalledWith('checklist-1', {
      config: expect.objectContaining({
        items: [{ id: '1', text: 'Task 1', completed: true }],
      }),
    });
  });

  it('toggles item completion on Space keydown', () => {
    const itemsWidget = {
      ...mockWidget,
      config: {
        ...mockWidget.config,
        items: [{ id: '1', text: 'Task 1', completed: false }],
      } as ChecklistConfig,
    };
    render(<ChecklistWidget widget={itemsWidget} />);

    const row = screen.getByRole('checkbox', { name: 'Task 1' });
    fireEvent.keyDown(row, { key: ' ', repeat: false });

    expect(mockUpdateWidget).toHaveBeenCalledWith('checklist-1', {
      config: expect.objectContaining({
        items: [{ id: '1', text: 'Task 1', completed: true }],
      }),
    });
  });

  it('toggles item completion on Enter keydown', () => {
    const itemsWidget = {
      ...mockWidget,
      config: {
        ...mockWidget.config,
        items: [{ id: '1', text: 'Task 1', completed: false }],
      } as ChecklistConfig,
    };
    render(<ChecklistWidget widget={itemsWidget} />);

    const row = screen.getByRole('checkbox', { name: 'Task 1' });
    fireEvent.keyDown(row, { key: 'Enter', repeat: false });

    expect(mockUpdateWidget).toHaveBeenCalledWith('checklist-1', {
      config: expect.objectContaining({
        items: [{ id: '1', text: 'Task 1', completed: true }],
      }),
    });
  });

  it('does not toggle on repeated keydown events (key held)', () => {
    const itemsWidget = {
      ...mockWidget,
      config: {
        ...mockWidget.config,
        items: [{ id: '1', text: 'Task 1', completed: false }],
      } as ChecklistConfig,
    };
    render(<ChecklistWidget widget={itemsWidget} />);

    const row = screen.getByRole('checkbox', { name: 'Task 1' });
    fireEvent.keyDown(row, { key: ' ', repeat: true });
    fireEvent.keyDown(row, { key: 'Enter', repeat: true });

    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('resets all checks when reset button is clicked', () => {
    const itemsWidget = {
      ...mockWidget,
      config: {
        ...mockWidget.config,
        items: [
          { id: '1', text: 'Task 1', completed: true },
          { id: '2', text: 'Task 2', completed: true },
        ],
      } as ChecklistConfig,
    };
    render(<ChecklistWidget widget={itemsWidget} />);

    fireEvent.click(screen.getByText('Reset Checks'));

    expect(mockUpdateWidget).toHaveBeenCalledWith('checklist-1', {
      config: expect.objectContaining({
        items: [
          { id: '1', text: 'Task 1', completed: false },
          { id: '2', text: 'Task 2', completed: false },
        ],
      }),
    });
  });
});

describe('ChecklistSettings Nexus Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as Mock).mockReturnValue(defaultContext);
  });

  it('imports steps from active Instructional Routine', () => {
    render(<ChecklistSettings widget={mockWidget} />);

    const importButton = screen.getByText('Sync');
    fireEvent.click(importButton);

    expect(mockAddToast).toHaveBeenCalledWith(
      'Imported steps from Routine!',
      'success'
    );
    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'checklist-1',
      expect.objectContaining({
        config: expect.objectContaining({
          mode: 'manual',
          items: expect.arrayContaining([
            expect.objectContaining({ text: 'Step 1', completed: false }),
            expect.objectContaining({ text: 'Step 2', completed: false }),
          ]),
        }),
      })
    );
  });

  it('shows error if no Instructional Routine widget exists', () => {
    (useDashboard as unknown as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
      activeDashboard: {
        widgets: [mockWidget], // No routine widget
      },
    });

    render(<ChecklistSettings widget={mockWidget} />);

    const importButton = screen.getByText('Sync');
    fireEvent.click(importButton);

    expect(mockAddToast).toHaveBeenCalledWith(
      'No Instructional Routines widget found!',
      'error'
    );
    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('shows info if Instructional Routine has no steps', () => {
    const emptyRoutineWidget = {
      ...mockRoutineWidget,
      config: { ...mockRoutineWidget.config, customSteps: [] },
    };

    (useDashboard as unknown as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
      activeDashboard: {
        widgets: [mockWidget, emptyRoutineWidget],
      },
    });

    render(<ChecklistSettings widget={mockWidget} />);
    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });
});

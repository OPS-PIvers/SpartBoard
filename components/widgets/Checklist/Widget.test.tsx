/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ChecklistWidget } from './Widget';
import { ChecklistSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { DashboardContextValue } from '@/context/DashboardContextValue';
import {
  InstructionalRoutinesConfig,
  WidgetData,
  ChecklistConfig,
} from '@/types';

// Mock dependencies
vi.mock('@/context/useDashboard');
vi.mock('@/components/common/RosterModeControl', () => ({
  RosterModeControl: () => <div data-testid="roster-mode-control" />,
}));
vi.mock('lucide-react', () => ({
  CheckSquare: () => <div data-testid="check-square" />,
  Square: () => <div data-testid="square" />,
  Circle: () => <div data-testid="circle" />,
  CheckCircle2: () => <div data-testid="check-circle-2" />,
  ListPlus: () => <div data-testid="list-plus" />,
  Type: () => <div />,
  Users: () => <div />,
  RefreshCw: () => <div />,
  BookOpen: () => <div />,
  Trash2: () => <div data-testid="trash-2" />,
  Palette: () => <div data-testid="palette" />,
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
    expect(screen.getByTestId('circle')).toBeInTheDocument();
    expect(screen.getByTestId('check-circle-2')).toBeInTheDocument();
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

  it('removes completed items when Remove Completed is clicked', () => {
    const itemsWidget = {
      ...mockWidget,
      config: {
        ...mockWidget.config,
        items: [
          { id: '1', text: 'Task 1', completed: true },
          { id: '2', text: 'Task 2', completed: false },
          { id: '3', text: 'Task 3', completed: true },
        ],
      } as ChecklistConfig,
    };
    render(<ChecklistWidget widget={itemsWidget} />);

    fireEvent.click(screen.getByTitle('Remove Completed'));

    expect(mockUpdateWidget).toHaveBeenCalledWith('checklist-1', {
      config: expect.objectContaining({
        items: [{ id: '2', text: 'Task 2', completed: false }],
      }),
    });
  });

  it('does not show Remove Completed button in roster mode', () => {
    const rosterWidget = {
      ...mockWidget,
      config: {
        ...mockWidget.config,
        mode: 'roster' as const,
        completedNames: ['Alice'],
        firstNames: 'Alice\nBob',
        lastNames: '',
      } as ChecklistConfig,
    };
    render(<ChecklistWidget widget={rosterWidget} />);

    expect(screen.queryByTitle('Remove Completed')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByTitle('Reset Checks'));

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

    const importSection = screen
      .getByText('Import Routine')
      .closest('.bg-indigo-50');
    expect(importSection).not.toBeNull();
    if (importSection) {
      const importButton = within(importSection as HTMLElement).getByRole(
        'button',
        { name: /Sync Routine/i }
      );
      fireEvent.click(importButton);
    }

    expect(mockAddToast).toHaveBeenCalledWith(
      'Imported steps from Routine!',
      'success'
    );
  });

  it('imports tasks from active Text widget', () => {
    (useDashboard as unknown as Mock).mockReturnValue({
      activeDashboard: {
        widgets: [
          {
            id: 'text-1',
            type: 'text',
            config: {
              content: 'Task 1\nTask 2\r\nTask 3',
            },
          },
        ],
      },
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
    });

    render(<ChecklistSettings widget={mockWidget} />);

    const importSection = screen
      .getByText('Import from Text Widget')
      .closest('.bg-emerald-50');
    expect(importSection).not.toBeNull();
    if (importSection) {
      const importButton = within(importSection as HTMLElement).getByRole(
        'button',
        { name: /Sync Text/i }
      );
      fireEvent.click(importButton);
    }

    expect(mockAddToast).toHaveBeenCalledWith(
      'Imported tasks from Text widget!',
      'success'
    );
    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'checklist-1',
      expect.objectContaining({
        config: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ text: 'Task 1' }),
            expect.objectContaining({ text: 'Task 2' }),
            expect.objectContaining({ text: 'Task 3' }),
          ]),
        }),
      })
    );
  });

  it('shows error if no active Text widget found', () => {
    (useDashboard as unknown as Mock).mockReturnValue({
      activeDashboard: {
        widgets: [],
      },
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
    });

    render(<ChecklistSettings widget={mockWidget} />);

    const importSection = screen
      .getByText('Import from Text Widget')
      .closest('.bg-emerald-50');
    expect(importSection).not.toBeNull();
    if (importSection) {
      const importButton = within(importSection as HTMLElement).getByRole(
        'button',
        { name: /Sync Text/i }
      );
      fireEvent.click(importButton);
    }

    expect(mockAddToast).toHaveBeenCalledWith('No Text widget found!', 'error');
  });

  it('shows info if active Text widget is empty', () => {
    (useDashboard as unknown as Mock).mockReturnValue({
      activeDashboard: {
        widgets: [
          {
            id: 'text-1',
            type: 'text',
            config: {
              content: '<p></p>',
            },
          },
        ],
      },
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
    });

    render(<ChecklistSettings widget={mockWidget} />);

    const importSection = screen
      .getByText('Import from Text Widget')
      .closest('.bg-emerald-50');
    expect(importSection).not.toBeNull();
    if (importSection) {
      const importButton = within(importSection as HTMLElement).getByRole(
        'button',
        { name: /Sync Text/i }
      );
      fireEvent.click(importButton);
    }

    expect(mockAddToast).toHaveBeenCalledWith(
      'All Text widgets are empty or have no usable text.',
      'info'
    );
    expect(mockUpdateWidget).not.toHaveBeenCalled();
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

    const importButton = within(
      screen.getByText('Import Routine').closest('.bg-indigo-50') as HTMLElement
    ).getByRole('button', { name: /Sync/i });
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

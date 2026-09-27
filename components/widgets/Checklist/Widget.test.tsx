/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ChecklistWidget } from './Widget';
import { ChecklistImportActionsField } from './settingsFields';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
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
// Class groups default OFF here, so these suites keep asserting the
// pre-feature behaviour (docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md D23).
// Flip `gate.enabled` inside a test to exercise the feature.
const gate = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/hooks/useRosterGroupsGate', () => ({
  useRosterGroupsGate: () => gate.enabled,
}));

const mockUpdateWidget = vi.fn();
const mockAddToast = vi.fn();
const mockUpdateConfig = vi.fn();

const importTranslations: Record<string, string> = {
  'widgetSettings.checklist.importRoutine': 'Import routine',
  'widgetSettings.checklist.importText': 'Import Text widget',
  'widgetSettings.checklist.noRoutine':
    'No Instructional Routines widget was found.',
  'widgetSettings.checklist.emptyRoutine':
    'The active routine has no steps to import.',
  'widgetSettings.checklist.routineImported':
    'Imported steps from the routine.',
  'widgetSettings.checklist.noTextWidget': 'No Text widget was found.',
  'widgetSettings.checklist.emptyTextWidget':
    'The Text widgets have no usable text.',
  'widgetSettings.checklist.textImported':
    'Imported tasks from the Text widget.',
};

const importCtx = (): CustomRenderCtx => ({
  config: mockWidget.config as Record<string, unknown>,
  widget: mockWidget,
  isAdmin: true,
  canAccessFeature: () => true,
  t: (key) => importTranslations[key] ?? key,
  updateConfig: mockUpdateConfig,
  id: 'checklist-imports',
  labelId: 'checklist-imports-label',
});

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
  zoom: 1,
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
    render(<ChecklistImportActionsField ctx={importCtx()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import routine' }));

    expect(mockAddToast).toHaveBeenCalledWith(
      'Imported steps from the routine.',
      'success'
    );
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'manual',
        items: [
          expect.objectContaining({ text: 'Step 1', completed: false }),
          expect.objectContaining({ text: 'Step 2', completed: false }),
        ],
      })
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

    render(<ChecklistImportActionsField ctx={importCtx()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import Text widget' }));

    expect(mockAddToast).toHaveBeenCalledWith(
      'Imported tasks from the Text widget.',
      'success'
    );
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ text: 'Task 1' }),
          expect.objectContaining({ text: 'Task 2' }),
          expect.objectContaining({ text: 'Task 3' }),
        ]),
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

    render(<ChecklistImportActionsField ctx={importCtx()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import Text widget' }));

    expect(mockAddToast).toHaveBeenCalledWith(
      'No Text widget was found.',
      'error'
    );
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

    render(<ChecklistImportActionsField ctx={importCtx()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import Text widget' }));

    expect(mockAddToast).toHaveBeenCalledWith(
      'The Text widgets have no usable text.',
      'info'
    );
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it('shows error if no Instructional Routine widget exists', () => {
    (useDashboard as unknown as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
      activeDashboard: {
        widgets: [mockWidget], // No routine widget
      },
    });

    render(<ChecklistImportActionsField ctx={importCtx()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import routine' }));

    expect(mockAddToast).toHaveBeenCalledWith(
      'No Instructional Routines widget was found.',
      'error'
    );
    expect(mockUpdateConfig).not.toHaveBeenCalled();
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

    render(<ChecklistImportActionsField ctx={importCtx()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import routine' }));

    expect(mockAddToast).toHaveBeenCalledWith(
      'The active routine has no steps to import.',
      'info'
    );
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});

/**
 * Pool filter (docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md D22).
 *
 * Checklist has no class chip, so the pool is chosen in the settings drawer —
 * but the behaviour that matters is the same as every other pooled widget:
 * the gate has to hold, and a group deleted out from under the widget must
 * fall back to the whole class rather than emptying it.
 */
describe('ChecklistWidget — class group pool', () => {
  const rosterContext: Partial<DashboardContextValue> = {
    ...defaultContext,
    activeRosterId: 'roster-1',
    rosters: [
      {
        id: 'roster-1',
        name: 'Period 3',
        students: [
          { id: 's1', firstName: 'Ana', lastName: 'Ba' },
          { id: 's2', firstName: 'Cy', lastName: 'Da' },
          { id: 's3', firstName: 'Eve', lastName: 'Fa' },
        ],
        groups: [{ id: 'g1', name: 'Reading', studentIds: ['s1', 's3'] }],
      },
    ] as unknown as DashboardContextValue['rosters'],
  };

  const rosterWidget = (config: Partial<ChecklistConfig>): WidgetData => ({
    ...mockWidget,
    flipped: false,
    config: {
      items: [],
      mode: 'roster',
      rosterMode: 'class',
      ...config,
    } as ChecklistConfig,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    gate.enabled = false;
    (useDashboard as unknown as Mock).mockReturnValue(rosterContext);
  });

  it('shows only the pool group once class groups are on', () => {
    gate.enabled = true;
    render(
      <ChecklistWidget widget={rosterWidget({ rosterPoolGroupId: 'g1' })} />
    );
    expect(screen.getByText('Ana Ba')).toBeInTheDocument();
    expect(screen.getByText('Eve Fa')).toBeInTheDocument();
    expect(screen.queryByText('Cy Da')).toBeNull();
  });

  it('ignores a stored pool while the feature is off', () => {
    render(
      <ChecklistWidget widget={rosterWidget({ rosterPoolGroupId: 'g1' })} />
    );
    expect(screen.getByText('Cy Da')).toBeInTheDocument();
  });

  it('falls back to the whole class when the group was deleted', () => {
    gate.enabled = true;
    render(
      <ChecklistWidget widget={rosterWidget({ rosterPoolGroupId: 'gone' })} />
    );
    expect(screen.getByText('Cy Da')).toBeInTheDocument();
  });
});

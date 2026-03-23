/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScoreboardWidget } from './Widget';
import { ScoreboardSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import * as ScoreboardItemModule from './components/ScoreboardItem';
import {
  WidgetData,
  ScoreboardConfig,
  RandomConfig,
  WidgetType,
  ScoreboardTeam,
} from '@/types';

vi.mock('@/context/useDashboard');

// Mock ScoreboardItem to spy on renders
vi.mock('./components/ScoreboardItem', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./components/ScoreboardItem')>();
  const React = await import('react');
  const { vi } = await import('vitest');

  const spy = vi.fn();

  const InnerItem = (props: {
    team: ScoreboardTeam;
    onUpdateScore: (id: string, delta: number) => void;
  }) => {
    spy(props);
    return (
      <div>
        {props.team.name} {props.team.score}
        <button onClick={() => props.onUpdateScore(props.team.id, 1)}>
          Increase score
        </button>
      </div>
    );
  };

  return {
    ...actual,
    ScoreboardItem: React.memo(InnerItem),
    itemRenderSpy: spy,
  };
});

const mockUpdateWidget = vi.fn();
const mockAddToast = vi.fn();

const mockDashboardContext = {
  updateWidget: mockUpdateWidget,
  addToast: mockAddToast,
  activeDashboard: {
    widgets: [],
  },
};

describe('ScoreboardWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
  });

  it('migrates legacy config on mount', () => {
    const legacyWidget: WidgetData = {
      id: 'test-id',
      type: 'scoreboard',
      config: {
        scoreA: 5,
        scoreB: 3,
        teamA: 'Alphas',
        teamB: 'Betas',
      } as ScoreboardConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    };

    render(<ScoreboardWidget widget={legacyWidget} />);

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'test-id',
      expect.objectContaining({
        config: expect.objectContaining({
          teams: expect.arrayContaining([
            expect.objectContaining({ name: 'Alphas', score: 5 }),
            expect.objectContaining({ name: 'Betas', score: 3 }),
          ]) as unknown,
        }) as unknown,
      })
    );
  });

  it('renders teams from config', () => {
    const widget: WidgetData = {
      id: 'test-id',
      type: 'scoreboard',
      config: {
        teams: [
          { id: '1', name: 'Team One', score: 10, color: 'bg-blue-500' },
          { id: '2', name: 'Team Two', score: 20, color: 'bg-red-500' },
        ],
      } as ScoreboardConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    };

    render(<ScoreboardWidget widget={widget} />);
    // Use regex to match text loosely because our mock renders simplified structure
    expect(screen.getByText(/Team One/)).toBeInTheDocument();
    expect(screen.getByText(/10/)).toBeInTheDocument();
    expect(screen.getByText(/Team Two/)).toBeInTheDocument();
    expect(screen.getByText(/20/)).toBeInTheDocument();
  });

  it('optimizes renders when updating scores', () => {
    // Access the spy from the mocked module
    const itemRenderSpy = (
      ScoreboardItemModule as unknown as { itemRenderSpy: Mock }
    ).itemRenderSpy;

    itemRenderSpy.mockClear();

    const teams = [
      { id: '1', name: 'Team One', score: 10, color: 'bg-blue-500' },
      { id: '2', name: 'Team Two', score: 20, color: 'bg-red-500' },
    ];

    const widget: WidgetData = {
      id: 'test-id',
      type: 'scoreboard',
      config: {
        teams,
      } as ScoreboardConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    };

    const { rerender } = render(<ScoreboardWidget widget={widget} />);

    // Initial render: 2 items
    expect(itemRenderSpy).toHaveBeenCalledTimes(2);
    itemRenderSpy.mockClear();

    // Simulate update: change score of Team One
    // We manually rerender with new props simulating the result of the update.
    // IMPORTANT: We must preserve the reference of the unchanged team object
    // to simulate how state updates work in React and satisfy React.memo.
    const updatedWidget: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        teams: [
          { ...teams[0], score: 11 }, // Changed (new object)
          teams[1], // Unchanged (same reference)
        ],
      } as ScoreboardConfig,
    };

    rerender(<ScoreboardWidget widget={updatedWidget} />);

    // Expectation:
    // Team One (id: 1) should re-render because props changed.
    // Team Two (id: 2) should NOT re-render because props are equal and component is memoized with stable callback.
    // Total calls should be 1.
    expect(itemRenderSpy).toHaveBeenCalledTimes(1);
    expect(itemRenderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        team: expect.objectContaining({ id: '1', score: 11 }),
      })
    );
  });

  it('uses DEFAULT_TEAMS when config.teams is invalid or missing during handleUpdateScore', () => {
    const widget: WidgetData = {
      id: 'test-id',
      type: 'scoreboard',
      config: {
        // Omitting teams completely
      } as ScoreboardConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    };

    render(<ScoreboardWidget widget={widget} />);

    // Since it's omitted, Widget renders DEFAULT_TEAMS ("Team A", "Team B").
    // We update team-a to test fallback logic.

    // We know from initial render that it migrated, but we want to trigger updateScore
    // We'll mock the hook to see updateScore behaviour directly
    const plusBtns = screen.getAllByRole('button', { name: /increase score/i });
    fireEvent.click(plusBtns[0]); // Increases Team A by 1

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'test-id',
      expect.objectContaining({
        config: expect.objectContaining({
          teams: expect.arrayContaining([
            expect.objectContaining({ id: 'team-a', score: 1 }), // DEFAULT_TEAMS starts with score 0
          ]),
        }) as unknown,
      })
    );
  });

  it('correctly handles rapid successive clicks without dropping updates', () => {
    const teams = [
      { id: '1', name: 'Team One', score: 10, color: 'bg-blue-500' },
    ];
    const widget: WidgetData = {
      id: 'test-id',
      type: 'scoreboard',
      config: { teams } as ScoreboardConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    };

    // To simulate rapid clicks, we render once and fire multiple click events.
    // The component should synchronously update its internal ref and issue updateWidget
    // with the accumulating score.
    render(<ScoreboardWidget widget={widget} />);

    mockUpdateWidget.mockClear();

    const plusBtns = screen.getAllByRole('button', { name: /increase score/i });

    // Simulate rapid, synchronous clicks
    fireEvent.click(plusBtns[0]); // Score goes 10 -> 11
    fireEvent.click(plusBtns[0]); // Score goes 11 -> 12
    fireEvent.click(plusBtns[0]); // Score goes 12 -> 13

    expect(mockUpdateWidget).toHaveBeenCalledTimes(3);

    // Check that the last call correctly accumulated the score to 13
    expect(mockUpdateWidget).toHaveBeenLastCalledWith(
      'test-id',
      expect.objectContaining({
        config: expect.objectContaining({
          teams: expect.arrayContaining([
            expect.objectContaining({ id: '1', score: 13 }),
          ]),
        }),
      })
    );
  });

  it('resets scores after confirmation', () => {
    const teams = [
      { id: '1', name: 'Team One', score: 10, color: 'bg-blue-500' },
      { id: '2', name: 'Team Two', score: 20, color: 'bg-red-500' },
    ];
    const widget: WidgetData = {
      id: 'scoreboard-id',
      type: 'scoreboard',
      config: { teams } as ScoreboardConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: true,
    };

    render(<ScoreboardSettings widget={widget} />);

    // Click "Reset Scores"
    const resetButton = screen.getByText('Reset Scores');
    fireEvent.click(resetButton);

    // Confirm buttons should appear
    expect(screen.getByText('Sure?')).toBeInTheDocument();

    // Click "Yes"
    const yesButton = screen.getByText('Yes');
    fireEvent.click(yesButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'scoreboard-id',
      expect.objectContaining({
        config: expect.objectContaining({
          teams: expect.arrayContaining([
            expect.objectContaining({ id: '1', score: 0 }),
            expect.objectContaining({ id: '2', score: 0 }),
          ]) as unknown,
        }) as unknown,
      })
    );
  });
});

describe('ScoreboardSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );

    // Clear mock histories to prevent state leaking between tests
    mockUpdateWidget.mockClear();
    mockAddToast.mockClear();
  });

  it('imports groups from random widget', () => {
    const widget: WidgetData = {
      id: 'scoreboard-id',
      type: 'scoreboard',
      config: { teams: [] } as ScoreboardConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: true,
    };

    const randomWidget: WidgetData = {
      id: 'random-id',
      type: 'random' as WidgetType,
      config: {
        lastResult: [
          { id: 'group-1', names: ['Alice', 'Bob'] },
          { id: 'group-2', names: ['Charlie', 'Dave'] },
        ],
      } as RandomConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: false,
    };

    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mockDashboardContext,
      activeDashboard: {
        widgets: [randomWidget],
        sharedGroups: [{ id: 'group-1', name: 'Custom Group Name 1' }],
      },
    });

    render(<ScoreboardSettings widget={widget} />);

    const importButton = screen.getByText('Import Groups');
    fireEvent.click(importButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'scoreboard-id',
      expect.objectContaining({
        config: expect.objectContaining({
          teams: expect.arrayContaining([
            expect.objectContaining({
              name: 'Custom Group Name 1',
              linkedGroupId: 'group-1',
            }),
            expect.objectContaining({ name: 'Group 2' }),
          ]) as unknown,
        }) as unknown,
      })
    );
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.stringContaining('Imported 2 groups'),
      'success'
    );
  });

  it('adds a new team', () => {
    const widget: WidgetData = {
      id: 'scoreboard-id',
      type: 'scoreboard',
      config: { teams: [] } as ScoreboardConfig,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      z: 1,
      flipped: true,
    };

    render(<ScoreboardSettings widget={widget} />);

    const addButton = screen.getByText('Add Team');
    fireEvent.click(addButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith(
      'scoreboard-id',
      expect.objectContaining({
        config: expect.objectContaining({
          teams: expect.arrayContaining([
            expect.objectContaining({ name: 'Team 1' }),
          ]) as unknown,
        }) as unknown,
      })
    );
  });
});

it('handles empty random result', () => {
  const widget: WidgetData = {
    id: 'scoreboard-id',
    type: 'scoreboard',
    config: { teams: [] } as ScoreboardConfig,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    flipped: true,
  };

  const randomWidget: WidgetData = {
    id: 'random-id',
    type: 'random' as WidgetType,
    config: {
      lastResult: null,
    } as RandomConfig,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    flipped: false,
  };

  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    ...mockDashboardContext,
    activeDashboard: {
      widgets: [randomWidget],
    },
  });

  render(<ScoreboardSettings widget={widget} />);
  const importButton = screen.getByText('Import Groups');
  fireEvent.click(importButton);

  expect(mockAddToast).toHaveBeenCalledWith(
    'Randomizer needs to have generated groups first.',
    'info'
  );
});

it('removes a team', () => {
  const teams = [
    { id: '1', name: 'Team One', score: 10, color: 'bg-blue-500' },
  ];
  const widget: WidgetData = {
    id: 'scoreboard-id',
    type: 'scoreboard',
    config: { teams } as ScoreboardConfig,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    flipped: true,
  };

  render(<ScoreboardSettings widget={widget} />);
  const removeButton = screen.getByRole('button', { name: '' }); // The trash icon button
  fireEvent.click(removeButton);

  expect(mockUpdateWidget).toHaveBeenCalledWith(
    'scoreboard-id',
    expect.objectContaining({
      config: expect.objectContaining({
        teams: [],
      }) as unknown,
    })
  );
});

it('cancels reset scores', () => {
  const teams = [
    { id: '1', name: 'Team One', score: 10, color: 'bg-blue-500' },
  ];
  const widget: WidgetData = {
    id: 'scoreboard-id',
    type: 'scoreboard',
    config: { teams } as ScoreboardConfig,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    flipped: true,
  };

  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    ...mockDashboardContext,
  });

  render(<ScoreboardSettings widget={widget} />);

  // Clear to ensure we don't pick up previous calls (like from auto-migration)
  mockUpdateWidget.mockClear();

  // Click "Reset Scores"
  const resetButton = screen.getByText('Reset Scores');
  fireEvent.click(resetButton);

  // Confirm buttons should appear
  expect(screen.getByText('Sure?')).toBeInTheDocument();

  // Click "No"
  const noButton = screen.getByText('No');
  fireEvent.click(noButton);

  expect(mockUpdateWidget).not.toHaveBeenCalled();
  expect(screen.queryByText('Sure?')).not.toBeInTheDocument();
});

it('updates team name', () => {
  vi.useFakeTimers();

  const teams = [
    {
      id: '1',
      name: 'Team One',
      score: 10,
      color: 'bg-blue-500',
      linkedGroupId: 'linked-group-1',
    },
  ];
  const widget: WidgetData = {
    id: 'scoreboard-id',
    type: 'scoreboard',
    config: { teams } as ScoreboardConfig,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    flipped: true,
  };

  const mockUpdateDashboard = vi.fn();
  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    ...mockDashboardContext,
    updateDashboard: mockUpdateDashboard,
    activeDashboard: {
      widgets: [],
      sharedGroups: [{ id: 'linked-group-1', name: 'Old Name' }],
    },
  });

  render(<ScoreboardSettings widget={widget} />);

  // Clear to ensure we don't pick up previous calls
  mockUpdateWidget.mockClear();

  const input = screen.getByPlaceholderText('Team Name');
  fireEvent.change(input, { target: { value: 'New Team Name' } });

  act(() => {
    vi.advanceTimersByTime(500);
  }); // Advance debounce time

  expect(mockUpdateWidget).toHaveBeenCalledWith(
    'scoreboard-id',
    expect.objectContaining({
      config: expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({ id: '1', name: 'New Team Name' }),
        ]),
      }) as unknown,
    })
  );

  expect(mockUpdateDashboard).toHaveBeenCalledWith({
    sharedGroups: [{ id: 'linked-group-1', name: 'New Team Name' }],
  });

  vi.useRealTimers();
});

it('shows error if no random widget on import', () => {
  const widget: WidgetData = {
    id: 'scoreboard-id',
    type: 'scoreboard',
    config: { teams: [] } as ScoreboardConfig,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    flipped: true,
  };

  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    ...mockDashboardContext,
    activeDashboard: {
      widgets: [],
    },
  });

  // Clear to ensure we don't pick up previous calls
  mockAddToast.mockClear();

  render(<ScoreboardSettings widget={widget} />);
  const importButton = screen.getByTestId('import-groups-btn');
  expect(importButton).toBeDisabled();
});

it('handles missing sharedGroups gracefully when updating team name', () => {
  vi.useFakeTimers();

  const teams = [
    {
      id: '1',
      name: 'Team One',
      score: 10,
      color: 'bg-blue-500',
      linkedGroupId: 'linked-group-1',
    },
  ];
  const widget: WidgetData = {
    id: 'scoreboard-id',
    type: 'scoreboard',
    config: { teams } as ScoreboardConfig,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    flipped: true,
  };

  const mockUpdateDashboard = vi.fn();
  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    ...mockDashboardContext,
    updateDashboard: mockUpdateDashboard,
    activeDashboard: {
      widgets: [],
      // Missing shared group with 'linked-group-1' ID
      sharedGroups: [],
    },
  });

  render(<ScoreboardSettings widget={widget} />);

  mockUpdateDashboard.mockClear();

  const input = screen.getByPlaceholderText('Team Name');
  fireEvent.change(input, {
    target: { value: 'New Name With No Shared Group' },
  });

  act(() => {
    vi.advanceTimersByTime(500);
  });

  // Should trigger the fallback branch `newSharedGroups = [...sharedGroups, { id: team.linkedGroupId, name }];`
  expect(mockUpdateDashboard).toHaveBeenCalledWith({
    sharedGroups: [
      { id: 'linked-group-1', name: 'New Name With No Shared Group' },
    ],
  });

  vi.useRealTimers();
});

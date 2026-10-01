import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoutineGuideConfig, WidgetData } from '@/types';
import { RoutineGuideWidget } from './Widget';

const updateWidget = vi.fn();
const addWidget = vi.fn();
const saveWidgetPreset = vi.fn();
let presets: Record<string, unknown> = {};
let featurePermissions: unknown[] = [];

vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({ updateWidget, addWidget }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    featurePermissions,
    userGradeLevels: ['k-2'],
    savedWidgetPresets: presets,
    saveWidgetPreset,
  }),
}));

const makeWidget = (config: Partial<RoutineGuideConfig> = {}): WidgetData =>
  ({
    id: 'rg-1',
    type: 'routineGuide',
    x: 0,
    y: 0,
    w: 420,
    h: 480,
    z: 1,
    flipped: false,
    config: { selectedRoutineId: null, stepIndex: 0, view: 'step', ...config },
  }) as WidgetData;

const adminLibrary = {
  widgetType: 'routineGuide',
  config: {
    routines: [
      {
        id: 'r1',
        name: 'Line Up',
        gradeLevels: ['k-2'],
        icon: 'Users',
        color: 'blue',
        steps: [
          { id: 's1', text: 'Push in your chair.', label: 'Chair' },
          {
            id: 's2',
            text: 'Walk to the door.',
            attachedWidget: { type: 'time-tool', label: 'Timer (1 min)' },
          },
        ],
      },
      {
        id: 'r2',
        name: 'Socratic Seminar',
        gradeLevels: ['9-12'],
        icon: 'MessagesSquare',
        color: 'purple',
        steps: [{ id: 's3', text: 'Read the text.' }],
      },
    ],
  },
};

describe('RoutineGuideWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    presets = {};
    featurePermissions = [];
  });

  it('shows the built-in library when no admin library is saved', () => {
    render(<RoutineGuideWidget widget={makeWidget()} />);
    expect(screen.getByText('Think-Pair-Share')).toBeInTheDocument();
  });

  it('filters by grade by default and shows everything under All', () => {
    featurePermissions = [adminLibrary];
    const { rerender } = render(<RoutineGuideWidget widget={makeWidget()} />);
    expect(screen.getByText('Line Up')).toBeInTheDocument();
    expect(screen.queryByText('Socratic Seminar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(saveWidgetPreset).toHaveBeenCalledWith('routineGuide', {
      libraryFilter: 'all',
    });

    presets = { routineGuide: { libraryFilter: 'all' } };
    rerender(<RoutineGuideWidget widget={makeWidget()} />);
    expect(screen.getByText('Socratic Seminar')).toBeInTheDocument();
  });

  it('saves favorites to the account and opens on the saved filter', () => {
    featurePermissions = [adminLibrary];
    presets = { routineGuide: { libraryFilter: 'favorites', favorites: [] } };
    const { rerender } = render(<RoutineGuideWidget widget={makeWidget()} />);
    expect(screen.getByText('No favorites yet')).toBeInTheDocument();

    presets = { routineGuide: { libraryFilter: 'all', favorites: [] } };
    rerender(<RoutineGuideWidget widget={makeWidget()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Favorite Line Up' }));
    expect(saveWidgetPreset).toHaveBeenCalledWith('routineGuide', {
      favorites: ['r1'],
    });
  });

  it('steps through a routine and launches an attached tool', () => {
    featurePermissions = [adminLibrary];
    const { rerender } = render(
      <RoutineGuideWidget widget={makeWidget({ selectedRoutineId: 'r1' })} />
    );
    expect(screen.getByText('Push in your chair.')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(updateWidget).toHaveBeenCalledWith('rg-1', {
      config: expect.objectContaining({ stepIndex: 1 }) as unknown,
    });

    rerender(
      <RoutineGuideWidget
        widget={makeWidget({ selectedRoutineId: 'r1', stepIndex: 1 })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Timer \(1 min\)/ }));
    expect(addWidget).toHaveBeenCalledWith('time-tool', {});
  });

  it('shows every step in the all-steps view', () => {
    featurePermissions = [adminLibrary];
    render(
      <RoutineGuideWidget
        widget={makeWidget({ selectedRoutineId: 'r1', view: 'all' })}
      />
    );
    expect(screen.getByText('Push in your chair.')).toBeInTheDocument();
    expect(screen.getByText('Walk to the door.')).toBeInTheDocument();
  });
});

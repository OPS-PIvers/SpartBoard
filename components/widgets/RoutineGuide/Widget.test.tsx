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
        categoryIds: ['general-literacy'],
        icon: 'Users',
        info: { why: 'Calm transitions.' },
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
        categoryIds: [],
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

  it('filters by grade by default and remembers another choice', () => {
    featurePermissions = [adminLibrary];
    const { rerender } = render(<RoutineGuideWidget widget={makeWidget()} />);
    expect(screen.getByText('Line Up')).toBeInTheDocument();
    expect(screen.queryByText('Socratic Seminar')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
      target: { value: 'all' },
    });
    expect(saveWidgetPreset).toHaveBeenCalledWith('routineGuide', {
      libraryFilter: 'all',
    });

    presets = { routineGuide: { libraryFilter: 'all' } };
    rerender(<RoutineGuideWidget widget={makeWidget()} />);
    expect(screen.getByText('Socratic Seminar')).toBeInTheDocument();
  });

  it('filters by category and by search', () => {
    featurePermissions = [adminLibrary];
    presets = { routineGuide: { libraryFilter: 'general-literacy' } };
    const { rerender } = render(<RoutineGuideWidget widget={makeWidget()} />);
    expect(screen.getByText('Line Up')).toBeInTheDocument();
    expect(screen.queryByText('Socratic Seminar')).not.toBeInTheDocument();

    presets = { routineGuide: { libraryFilter: 'all' } };
    rerender(<RoutineGuideWidget widget={makeWidget()} />);
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search routines' }),
      {
        target: { value: 'socr' },
      }
    );
    expect(screen.getByText('Socratic Seminar')).toBeInTheDocument();
    expect(screen.queryByText('Line Up')).not.toBeInTheDocument();
  });

  it('floats favorites to the top and saves them to the account', () => {
    featurePermissions = [adminLibrary];
    presets = { routineGuide: { libraryFilter: 'all', favorites: ['r2'] } };
    render(<RoutineGuideWidget widget={makeWidget()} />);
    const names = screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => t === 'Line Up' || t === 'Socratic Seminar');
    expect(names).toEqual(['Socratic Seminar', 'Line Up']);

    fireEvent.click(screen.getByRole('button', { name: 'Favorite Line Up' }));
    expect(saveWidgetPreset).toHaveBeenCalledWith('routineGuide', {
      favorites: ['r2', 'r1'],
    });
  });

  it('previews a routine and launches it as its own widget', () => {
    featurePermissions = [adminLibrary];
    render(
      <RoutineGuideWidget widget={makeWidget({ selectedRoutineId: 'r1' })} />
    );
    expect(screen.getByText('Push in your chair.')).toBeInTheDocument();
    expect(screen.getByText('Walk to the door.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Launch/ }));
    expect(addWidget).toHaveBeenCalledWith(
      'routineGuide',
      expect.objectContaining({
        config: expect.objectContaining({
          selectedRoutineId: 'r1',
          mode: 'display',
        }) as unknown,
      })
    );
  });

  it('opens the info modal when a routine has rationale', () => {
    featurePermissions = [adminLibrary];
    render(
      <RoutineGuideWidget widget={makeWidget({ selectedRoutineId: 'r1' })} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'About Line Up' }));
    expect(screen.getByText('Calm transitions.')).toBeInTheDocument();
  });

  it('steps through a launched routine and launches an attached tool', () => {
    featurePermissions = [adminLibrary];
    const display = { selectedRoutineId: 'r1', mode: 'display' as const };
    const { rerender } = render(
      <RoutineGuideWidget widget={makeWidget(display)} />
    );
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'All routines' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(updateWidget).toHaveBeenCalledWith('rg-1', {
      config: expect.objectContaining({ stepIndex: 1 }) as unknown,
    });

    rerender(
      <RoutineGuideWidget widget={makeWidget({ ...display, stepIndex: 1 })} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Timer \(1 min\)/ }));
    expect(addWidget).toHaveBeenCalledWith('time-tool', {});
  });

  it('shows every step in the all-steps view', () => {
    featurePermissions = [adminLibrary];
    render(
      <RoutineGuideWidget
        widget={makeWidget({
          selectedRoutineId: 'r1',
          mode: 'display',
          view: 'all',
        })}
      />
    );
    expect(screen.getByText('Push in your chair.')).toBeInTheDocument();
    expect(screen.getByText('Walk to the door.')).toBeInTheDocument();
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { render, screen, fireEvent } from '@testing-library/react';
import { InstructionalRoutinesWidget } from './Widget';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { WidgetData } from '@/types';

const addWidgetSpy = vi.fn();
const access = { routineGuide: false, readOnly: false };
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: vi.fn(),
    addWidget: addWidgetSpy,
    clearAllStickers: vi.fn(),
    isActiveBoardReadOnly: access.readOnly,
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    isAdmin: false,
    userGradeLevels: [],
    canAccessWidget: (type: string) =>
      type === 'routineGuide' ? access.routineGuide : true,
  }),
}));

vi.mock('@/hooks/useInstructionalRoutines', () => ({
  useInstructionalRoutines: () => ({
    routines: [],
    saveRoutine: vi.fn(),
    deleteRoutine: vi.fn(),
  }),
}));

const mockWidget: WidgetData = {
  id: 'test-widget',
  type: 'instructionalRoutines',
  w: 400,
  h: 300,
  x: 0,
  y: 0,
  z: 0,
  flipped: false,
  config: {
    selectedRoutineId: null,
    customSteps: [],
    favorites: [],
    scaleMultiplier: 1,
  },
};

const mockBloomsWidget: WidgetData = {
  ...mockWidget,
  config: {
    selectedRoutineId: 'blooms-analysis',
    customSteps: [],
    favorites: [],
    scaleMultiplier: 1,
  },
};

describe('InstructionalRoutinesWidget', () => {
  it('renders correctly in library mode', () => {
    render(<InstructionalRoutinesWidget widget={mockWidget} />);
    expect(screen.getAllByText(/Select/i)[0]).toBeInTheDocument();
  });

  it('calls addWidget with Tailwind classes when launching Blooms resources', () => {
    render(<InstructionalRoutinesWidget widget={mockBloomsWidget} />);

    // Find the "Key Words" button
    const keyWordsButton = screen.getByRole('button', { name: /Key Words/i });
    fireEvent.click(keyWordsButton);

    expect(addWidgetSpy).toHaveBeenCalledWith(
      'text',
      expect.objectContaining({
        config: expect.objectContaining({
          content: expect.stringContaining(
            'class="font-black mb-[0.5em] uppercase text-slate-800"'
          ),
        }),
      })
    );

    expect(addWidgetSpy).toHaveBeenCalledWith(
      'text',
      expect.objectContaining({
        config: expect.objectContaining({
          content: expect.stringContaining(
            'class="font-extrabold mt-[1em] mb-[0.25em] text-brand-blue-primary text-[0.9em]"'
          ),
        }),
      })
    );
  });
});

describe('Routines retirement notice', () => {
  beforeEach(() => {
    addWidgetSpy.mockClear();
    access.routineGuide = true;
    access.readOnly = false;
  });

  it('shows when the teacher can use Routine Guide', () => {
    render(<InstructionalRoutinesWidget widget={mockWidget} />);
    expect(
      screen.getByRole('dialog', { name: 'Routines is going away soon' })
    ).toBeInTheDocument();
  });

  it('stays hidden when Routine Guide is not available', () => {
    access.routineGuide = false;
    render(<InstructionalRoutinesWidget widget={mockWidget} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays hidden on a read-only board', () => {
    access.readOnly = true;
    render(<InstructionalRoutinesWidget widget={mockWidget} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a Routine Guide widget and closes', () => {
    render(<InstructionalRoutinesWidget widget={mockWidget} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Routine Guide' }));
    expect(addWidgetSpy).toHaveBeenCalledWith('routineGuide');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Not now without adding a widget', () => {
    render(<InstructionalRoutinesWidget widget={mockWidget} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(addWidgetSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

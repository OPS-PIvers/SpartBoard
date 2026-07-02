/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { render, screen, fireEvent } from '@testing-library/react';
import { InstructionalRoutinesWidget } from './Widget';
import { InstructionalRoutinesSettings } from './Settings';
import { vi, describe, it, expect } from 'vitest';
import { WidgetData } from '@/types';

const addWidgetSpy = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: vi.fn(),
    addWidget: addWidgetSpy,
    clearAllStickers: vi.fn(),
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    isAdmin: false,
    userGradeLevels: [],
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

describe('InstructionalRoutinesSettings', () => {
  it('renders correctly', () => {
    render(<InstructionalRoutinesSettings widget={mockWidget} />);
    expect(screen.getByText(/Step Editor/i)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useCatalystSets } from '@/hooks/useCatalystSets';
import { WidgetData } from '@/types';
import { CatalystWidget } from './CatalystWidget';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useCatalystSets', () => ({
  useCatalystSets: vi.fn(),
}));

vi.mock('@/components/widgets/StarterPack/audioUtils', () => ({
  playCleanUp: vi.fn(),
  getAudioCtx: vi.fn(() => null),
}));

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

const mockAddWidget = vi.fn();
const mockDeleteAllWidgets = vi.fn();
const mockExecuteRoutine = vi.fn();

const createWidget = (): WidgetData => ({
  id: 'catalyst-1',
  type: 'catalyst',
  x: 0,
  y: 0,
  w: 450,
  h: 600,
  z: 1,
  flipped: false,
  config: {},
});

describe('CatalystWidget', () => {
  beforeEach(() => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      addWidget: mockAddWidget,
      deleteAllWidgets: mockDeleteAllWidgets,
    });
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: [],
    });
    (useCatalystSets as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      sets: [],
      loading: false,
      executeRoutine: mockExecuteRoutine,
    });
    mockAddWidget.mockClear();
    mockDeleteAllWidgets.mockClear();
    mockExecuteRoutine.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows loading state when loading', () => {
    (useCatalystSets as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      sets: [],
      loading: true,
      executeRoutine: mockExecuteRoutine,
    });
    render(<CatalystWidget widget={createWidget()} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty state when no sets', () => {
    render(<CatalystWidget widget={createWidget()} />);
    expect(screen.getByText('No Sets')).toBeInTheDocument();
  });

  it('renders set buttons when sets are available', () => {
    (useCatalystSets as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      sets: [
        {
          id: 'set-1',
          title: 'Morning Routines',
          imageUrl: undefined,
          routines: [
            { id: 'r1', title: 'Routine 1', widgets: [], createdAt: 1 },
          ],
          createdAt: 1,
        },
      ],
      loading: false,
      executeRoutine: mockExecuteRoutine,
    });

    render(<CatalystWidget widget={createWidget()} />);
    expect(screen.getByText('Morning Routines')).toBeInTheDocument();
    expect(screen.getByText('1 ROUTINE')).toBeInTheDocument();
  });

  it('navigates to routines list when a set is clicked', async () => {
    const user = userEvent.setup();
    (useCatalystSets as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      sets: [
        {
          id: 'set-1',
          title: 'Morning Routines',
          imageUrl: undefined,
          routines: [
            { id: 'r1', title: 'Routine 1', widgets: [], createdAt: 1 },
          ],
          createdAt: 1,
        },
      ],
      loading: false,
      executeRoutine: mockExecuteRoutine,
    });

    render(<CatalystWidget widget={createWidget()} />);

    const setButton = screen.getByText('Morning Routines').closest('button');
    if (!setButton) throw new Error('Set button not found');
    await user.click(setButton);

    // Should now see the routine
    expect(screen.getByText('Routine 1')).toBeInTheDocument();
  });
});

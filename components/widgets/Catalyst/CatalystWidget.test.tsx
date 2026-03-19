import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useCatalystRoutines } from '@/hooks/useCatalystRoutines';
import { WidgetData } from '@/types';
import { CatalystWidget } from './CatalystWidget';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useCatalystRoutines', () => ({
  useCatalystRoutines: vi.fn(),
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
    (
      useCatalystRoutines as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      routines: [],
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
    (
      useCatalystRoutines as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      routines: [],
      loading: true,
      executeRoutine: mockExecuteRoutine,
    });
    render(<CatalystWidget widget={createWidget()} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty state when no routines', () => {
    render(<CatalystWidget widget={createWidget()} />);
    expect(screen.getByText('No Routines')).toBeInTheDocument();
  });

  it('renders routine buttons when routines are available', () => {
    (
      useCatalystRoutines as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      routines: [
        {
          id: 'r1',
          title: 'Morning Meeting',
          imageUrl: undefined,
          widgets: [],
          createdAt: 1,
        },
        {
          id: 'r2',
          title: 'Brain Break',
          imageUrl: 'https://example.com/img.jpg',
          widgets: [],
          createdAt: 2,
        },
      ],
      loading: false,
      executeRoutine: mockExecuteRoutine,
    });

    render(<CatalystWidget widget={createWidget()} />);

    // CSS uppercase is applied via Tailwind; DOM text is the raw title
    expect(screen.getByText('Morning Meeting')).toBeInTheDocument();
    expect(screen.getByText('Brain Break')).toBeInTheDocument();
  });

  it('renders image when routine has a safe imageUrl', () => {
    const imageUrl = 'https://example.com/img.jpg';
    (
      useCatalystRoutines as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      routines: [
        { id: 'r1', title: 'My Routine', imageUrl, widgets: [], createdAt: 1 },
      ],
      loading: false,
      executeRoutine: mockExecuteRoutine,
    });

    render(<CatalystWidget widget={createWidget()} />);

    const img = screen.getByAltText('My Routine');
    expect(img).toHaveAttribute('src', imageUrl);
  });

  it('shows image placeholder when no imageUrl', () => {
    (
      useCatalystRoutines as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      routines: [
        {
          id: 'r1',
          title: 'No Image',
          imageUrl: undefined,
          widgets: [],
          createdAt: 1,
        },
      ],
      loading: false,
      executeRoutine: mockExecuteRoutine,
    });

    render(<CatalystWidget widget={createWidget()} />);
    expect(screen.getByText('IMAGE PLACEHOLDER')).toBeInTheDocument();
  });

  it('does not render an img for unsafe imageUrl', () => {
    (
      useCatalystRoutines as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      routines: [
        {
          id: 'r1',
          title: 'Bad URL',
          imageUrl: 'http://insecure.example.com/img.jpg',
          widgets: [],
          createdAt: 1,
        },
      ],
      loading: false,
      executeRoutine: mockExecuteRoutine,
    });

    render(<CatalystWidget widget={createWidget()} />);
    expect(screen.queryByAltText('Bad URL')).not.toBeInTheDocument();
    expect(screen.getByText('IMAGE PLACEHOLDER')).toBeInTheDocument();
  });
});

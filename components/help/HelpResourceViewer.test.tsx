import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';
import { TOUR_EDIT_EVENT } from '@/components/tours/editor/tourEditStore';
import { TOUR_START_EVENT } from '@/components/tours/tourState';
import { HelpResourceViewer } from './HelpResourceViewer';

const h = vi.hoisted(() => ({
  canTour: true,
  canRunLive: true,
  published: true,
  isAdmin: false,
  loadBuildingSet: vi.fn(),
}));

vi.mock('@/components/tours/publishedTours', () => ({
  watchTours: () => () => undefined,
  getToursVersion: () => 0,
  isTourRunnable: () => h.published,
  loadRunnableTour: vi.fn(),
}));

vi.mock('@/components/tours/useCanRunLiveTour', () => ({
  useCanRunLiveTour: () => h.canRunLive,
}));

vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: h.loadBuildingSet,
}));

vi.mock('@/hooks/useHelpResources', () => ({
  incrementHelpOpenCount: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: (id: string) => h.canTour && id === 'gl-live-tours',
    isAdmin: h.isAdmin,
  }),
}));

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningPlayer',
  () => ({ GuidedLearningPlayer: () => <div>player</div> })
);

const item = {
  id: 'help-1',
  kind: 'guided-learning',
  title: 'Clock basics',
  description: '',
  setId: 'set-1',
  url: null,
  widgetTypes: [],
} as unknown as HelpResourceItem;

const set = (withTour: boolean) =>
  ({
    id: 'set-1',
    steps: [
      withTour
        ? { id: 's', tour: { anchor: 'sidebar.boards', action: 'click' } }
        : { id: 's' },
    ],
  }) as unknown as GuidedLearningSet;

beforeEach(() => {
  h.canTour = true;
  h.canRunLive = true;
  h.published = true;
  h.isAdmin = false;
  h.loadBuildingSet.mockReset();
});

describe('HelpResourceViewer live tours', () => {
  it('starts the live tour for a set that has one', async () => {
    h.loadBuildingSet.mockResolvedValue(set(true));
    const started = vi.fn();
    window.addEventListener(TOUR_START_EVENT, started);
    render(<HelpResourceViewer item={item} onBack={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show me live' })
    );
    expect(
      (started.mock.calls[0][0] as CustomEvent<{ setId: string }>).detail
    ).toEqual({ setId: 'set-1' });
    window.removeEventListener(TOUR_START_EVENT, started);
  });

  it('shows only the player while the tour is not published', async () => {
    h.published = false;
    h.loadBuildingSet.mockResolvedValue(set(true));
    render(<HelpResourceViewer item={item} onBack={vi.fn()} />);
    expect(await screen.findByText('player')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show me live' })
    ).not.toBeInTheDocument();
  });

  it('lets an admin open a tour that was never published in the editor', async () => {
    h.published = false;
    h.isAdmin = true;
    h.loadBuildingSet.mockResolvedValue(set(true));
    const edited = vi.fn();
    window.addEventListener(TOUR_EDIT_EVENT, edited);
    render(<HelpResourceViewer item={item} onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit tour' }));
    window.removeEventListener(TOUR_EDIT_EVENT, edited);
    expect(
      (edited.mock.calls[0][0] as CustomEvent<{ setId: string }>).detail
    ).toEqual({ setId: 'set-1' });
  });

  it('hides Show me live without the flag', async () => {
    h.canTour = false;
    h.loadBuildingSet.mockResolvedValue(set(true));
    render(<HelpResourceViewer item={item} onBack={vi.fn()} />);
    expect(await screen.findByText('player')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show me live' })
    ).not.toBeInTheDocument();
  });

  it('lists the steps instead of the player where a tour cannot run live', async () => {
    h.canRunLive = false;
    h.loadBuildingSet.mockResolvedValue({
      ...set(true),
      imageUrls: [],
      steps: [
        {
          id: 'a',
          label: 'Open Boards',
          text: 'Click **Boards** in the sidebar.',
          imageIndex: 0,
          tour: { anchor: 'sidebar.boards', action: 'click' },
        },
      ],
    });
    render(<HelpResourceViewer item={item} onBack={vi.fn()} />);
    expect(await screen.findByTestId('tour-step-list')).toBeInTheDocument();
    expect(screen.getByText('Open Boards')).toBeInTheDocument();
    expect(screen.queryByText('player')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show me live' })
    ).not.toBeInTheDocument();
  });

  it('keeps the player for a plain activity where tours cannot run', async () => {
    h.canRunLive = false;
    h.loadBuildingSet.mockResolvedValue(set(false));
    render(<HelpResourceViewer item={item} onBack={vi.fn()} />);
    expect(await screen.findByText('player')).toBeInTheDocument();
  });
});

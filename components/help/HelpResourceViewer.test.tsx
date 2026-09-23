import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';
import { TOUR_START_EVENT } from '@/components/tours/tourState';
import { HelpResourceViewer } from './HelpResourceViewer';

const h = vi.hoisted(() => ({
  canTour: true,
  loadBuildingSet: vi.fn(),
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

  it('shows only the player for a set without a tour', async () => {
    h.loadBuildingSet.mockResolvedValue(set(false));
    render(<HelpResourceViewer item={item} onBack={vi.fn()} />);
    expect(await screen.findByText('player')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show me live' })
    ).not.toBeInTheDocument();
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
});

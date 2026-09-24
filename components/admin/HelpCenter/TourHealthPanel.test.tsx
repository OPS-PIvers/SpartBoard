import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { TOUR_RECORD_EVENT } from '@/components/tours/tourState';
import TourHealthPanel from './TourHealthPanel';

const h = vi.hoisted(() => ({
  sets: [] as GuidedLearningSet[],
  saveBuildingSet: vi.fn(),
  loadBuildingSet: vi.fn(),
}));

// The panel lists index entries and fetches only the sets marked as tours.
vi.mock('@/hooks/useGuidedLearning', () => ({
  useGuidedLearning: () => ({
    buildingSets: h.sets.map((set) => ({
      id: set.id,
      title: set.title,
      updatedAt: 1,
      hasLiveTour: set.steps.some((step) => !!step.tour),
    })),
    buildingLoading: false,
    saveBuildingSet: h.saveBuildingSet,
  }),
  loadBuildingSet: h.loadBuildingSet,
}));

vi.mock(
  '@/components/widgets/GuidedLearning/components/studio/GuidedLearningStudio',
  () => ({
    GuidedLearningStudio: ({
      set,
      initialStepId,
    }: {
      set: GuidedLearningSet;
      initialStepId?: string;
    }) => (
      <div data-testid="studio">
        {set.id}:{initialStepId}:{String(set.isBuilding)}
      </div>
    ),
  })
);

const tourSet = {
  id: 'set-1',
  title: 'Clock tour',
  imageUrls: [],
  steps: [
    { id: 'intro', label: 'Welcome' },
    {
      id: 'a',
      label: 'Open boards',
      tour: { anchor: 'sidebar.boards', action: 'click' },
    },
    {
      id: 'b',
      label: 'Old button',
      tour: { anchor: 'sidebar.retired', action: 'click' },
    },
  ],
} as unknown as GuidedLearningSet;

const plainSet = {
  id: 'set-2',
  title: 'No tour',
  imageUrls: [],
  steps: [{ id: 'x', label: 'Just a slide' }],
} as unknown as GuidedLearningSet;

beforeEach(() => {
  h.sets = [tourSet, plainSet];
  h.loadBuildingSet.mockReset();
  h.loadBuildingSet.mockImplementation((id: string) =>
    Promise.resolve(h.sets.find((set) => set.id === id) ?? null)
  );
  document.body.innerHTML = '';
  // jsdom has no layout; zero-size anchors would read as hidden.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 40, 40)
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TourHealthPanel', () => {
  it('lists only sets with tour steps and flags unregistered anchors', async () => {
    render(<TourHealthPanel />);
    const section = await screen.findByRole('region', { name: 'Clock tour' });
    expect(
      screen.queryByRole('region', { name: 'No tour' })
    ).not.toBeInTheDocument();
    expect(h.loadBuildingSet).toHaveBeenCalledTimes(1);
    expect(h.loadBuildingSet).toHaveBeenCalledWith('set-1');
    expect(within(section).getByText('1 broken anchor')).toBeInTheDocument();
    const rows = within(section).getAllByRole('row');
    expect(within(rows[1]).getByText('Registered')).toBeInTheDocument();
    expect(
      within(rows[2]).getByText('Not in the anchor registry')
    ).toBeInTheDocument();
  });

  it('checks anchors against the page on Check live', async () => {
    render(
      <>
        <button data-tour="sidebar.boards">Boards</button>
        <TourHealthPanel />
      </>
    );
    const section = await screen.findByRole('region', { name: 'Clock tour' });
    expect(within(section).getAllByText('Not checked')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Check live' }));
    const rows = within(section).getAllByRole('row');
    expect(within(rows[1]).getByText('Found')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Not found')).toBeInTheDocument();
  });

  it('opens the set in the Studio at the step', async () => {
    render(<TourHealthPanel />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open in Studio: step 3 of Clock tour',
      })
    );
    expect(await screen.findByTestId('studio')).toHaveTextContent(
      'set-1:b:true'
    );
  });

  it('starts a recording from Record a tour, only with live tours on', async () => {
    h.sets = [];
    const { unmount } = render(<TourHealthPanel />);
    await screen.findByText('No Guided Learning set has live-tour steps yet.');
    expect(screen.queryByRole('button', { name: 'Record a tour' })).toBeNull();
    unmount();

    const onRecord = vi.fn();
    window.addEventListener(TOUR_RECORD_EVENT, onRecord);
    render(
      <AuthContext.Provider
        value={
          {
            canAccessFeature: (id: string) => id === 'gl-live-tours',
          } as unknown as AuthContextType
        }
      >
        <TourHealthPanel />
      </AuthContext.Provider>
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record a tour' })
    );
    expect(onRecord).toHaveBeenCalledTimes(1);
    window.removeEventListener(TOUR_RECORD_EVENT, onRecord);
  });
});

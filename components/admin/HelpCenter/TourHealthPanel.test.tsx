import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { TOUR_EDIT_EVENT } from '@/components/tours/editor/tourEditStore';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import TourHealthPanel from './TourHealthPanel';

const h = vi.hoisted(() => ({
  sets: [] as GuidedLearningSet[],
  loadBuildingSet: vi.fn(),
  published: new Map<string, unknown>(),
  runs: new Map<string, unknown[]>(),
}));

vi.mock('@/components/tours/publishedTours', () => ({
  loadPublishedTour: (id: string) =>
    Promise.resolve(h.published.get(id) ?? null),
}));
vi.mock('@/components/tours/tourRuns', () => ({
  loadTourRuns: (id: string) => Promise.resolve(h.runs.get(id) ?? []),
}));

vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: h.loadBuildingSet,
}));

const tourSet = {
  id: 'set-1',
  title: 'Clock tour',
  updatedAt: 5,
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
  h.published.clear();
  h.runs.clear();
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

const renderPanel = (setId = 'set-1') =>
  render(<TourHealthPanel setId={setId} />);

describe('TourHealthPanel', () => {
  it("shows one tour's state and flags unregistered anchors", async () => {
    renderPanel();
    const section = await screen.findByRole('region', { name: 'Clock tour' });
    expect(h.loadBuildingSet).toHaveBeenCalledTimes(1);
    expect(h.loadBuildingSet).toHaveBeenCalledWith('set-1');
    expect(within(section).getByTestId('tour-state')).toHaveTextContent(
      'Broken'
    );
    expect(
      within(section).getByText(/Not published: showing the saved set/)
    ).toBeInTheDocument();
    const steps = within(section).getAllByTestId('tour-step');
    expect(steps).toHaveLength(2);
    expect(within(steps[0]).getByText('OK')).toBeInTheDocument();
    expect(
      within(steps[1]).getByText('Not in the anchor registry')
    ).toBeInTheDocument();
  });

  it('renders nothing for a set without tour steps', async () => {
    const { container } = renderPanel('set-2');
    await waitFor(() => expect(h.loadBuildingSet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('warns on typed text that is empty or matches a roster name', async () => {
    h.sets = [
      {
        ...tourSet,
        steps: [
          {
            id: 'e',
            tour: { anchor: 'sidebar.boards', action: 'type', value: '' },
          },
          {
            id: 'n',
            tour: {
              anchor: 'sidebar.boards',
              action: 'type',
              value: 'avery lindqvist',
            },
          },
          {
            id: 'ok',
            tour: {
              anchor: 'sidebar.boards',
              action: 'type',
              value: 'Warm up',
            },
          },
        ],
      } as unknown as GuidedLearningSet,
    ];
    const dashboard = {
      rosters: [{ students: [{ firstName: 'Avery', lastName: 'Lindqvist' }] }],
    } as unknown as DashboardContextValue;
    render(
      <DashboardContext.Provider value={dashboard}>
        <TourHealthPanel setId="set-1" />
      </DashboardContext.Provider>
    );
    const section = await screen.findByRole('region', { name: 'Clock tour' });
    const steps = within(section).getAllByTestId('tour-step');
    expect(
      within(steps[0]).getByTestId('tour-value-warning')
    ).toHaveTextContent('No text for Autopilot to type');
    expect(
      within(steps[1]).getByTestId('tour-value-warning')
    ).toHaveTextContent("The typed text matches a student's name");
    expect(within(steps[2]).queryByTestId('tour-value-warning')).toBeNull();
  });

  it('checks anchors against the page on Check live', async () => {
    render(
      <>
        <button data-tour="sidebar.boards">Boards</button>
        <TourHealthPanel setId="set-1" />
      </>
    );
    const section = await screen.findByRole('region', { name: 'Clock tour' });
    expect(within(section).getAllByText('Not checked')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Check live' }));
    const steps = within(section).getAllByTestId('tour-step');
    expect(within(steps[0]).getByText('Found')).toBeInTheDocument();
    expect(within(steps[1]).getByText('Not found')).toBeInTheDocument();
  });

  it('reads the published snapshot and counts misses from its runs only', async () => {
    const snapshotSet = {
      ...tourSet,
      steps: [
        {
          id: 'a',
          label: 'Open boards',
          tour: { anchor: 'sidebar.boards', action: 'click' },
        },
        {
          id: 'c',
          label: 'Open the menu',
          tour: { anchor: 'sidebar.open-menu', action: 'click' },
        },
      ],
    };
    h.published.set('set-1', {
      set: snapshotSet,
      publishedAt: 9,
      publishedBy: 'admin',
    });
    h.runs.set('set-1', [
      { v: 9, startedAt: 1, furthest: 1, done: true, misses: [] },
      { v: 9, startedAt: 2, furthest: 1, done: false, exit: 1, misses: ['c'] },
      // A run of an older version: its miss no longer counts.
      { v: 5, startedAt: 0, furthest: 0, done: false, misses: ['a'] },
    ]);
    renderPanel();
    const section = await screen.findByRole('region', { name: 'Clock tour' });
    expect(
      within(section).getByText(
        'Published · Real runs of this version: 2 · Finished: 1'
      )
    ).toBeInTheDocument();
    // The draft's retired anchor isn't in the snapshot teachers run.
    expect(within(section).queryByText('sidebar.retired')).toBeNull();
    const steps = within(section).getAllByTestId('tour-step');
    expect(steps).toHaveLength(2);
    expect(within(steps[0]).getByText('OK')).toBeInTheDocument();
    expect(within(steps[1]).getByText('Broken')).toBeInTheDocument();
    expect(
      within(steps[1]).getByText('Not found in 1 of 2 real runs')
    ).toBeInTheDocument();
  });

  it('shows the three states, with a closed panel as needs-open', async () => {
    h.sets = [
      {
        ...tourSet,
        tourSetup: { widgets: ['clock'] },
        steps: [
          { id: 'o', tour: { anchor: 'sidebar.open-menu', action: 'click' } },
          { id: 'm', tour: { anchor: 'sidebar.boards', action: 'click' } },
          { id: 'w', tour: { anchor: 'widget.title', action: 'observe' } },
        ],
      } as unknown as GuidedLearningSet,
    ];
    render(
      <>
        <button data-tour="sidebar.open-menu">Menu</button>
        <TourHealthPanel setId="set-1" />
      </>
    );
    const section = await screen.findByRole('region', { name: 'Clock tour' });
    expect(within(section).getByTestId('tour-state')).toHaveTextContent('OK');
    fireEvent.click(screen.getByRole('button', { name: 'Check live' }));
    const steps = within(section).getAllByTestId('tour-step');
    expect(within(steps[0]).getByText('OK')).toBeInTheDocument();
    expect(
      within(steps[1]).getByText('Needs its menu or panel open')
    ).toBeInTheDocument();
    expect(
      within(steps[2]).getByText('Needs Clock on the board')
    ).toBeInTheDocument();
    expect(within(section).getByTestId('tour-state')).toHaveTextContent(
      'Needs widget or panel open'
    );
  });

  it('opens the board editor at the step, from the Help Center', async () => {
    const onEdit = vi.fn();
    window.addEventListener(TOUR_EDIT_EVENT, onEdit);
    renderPanel();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Edit step 3 of Clock tour',
      })
    );
    window.removeEventListener(TOUR_EDIT_EVENT, onEdit);
    expect((onEdit.mock.calls[0][0] as CustomEvent).detail).toEqual({
      setId: 'set-1',
      stepId: 'b',
      origin: 'help-center',
    });
  });

  it('has no record buttons', async () => {
    renderPanel();
    await screen.findByRole('region', { name: 'Clock tour' });
    expect(screen.queryByRole('button', { name: /Record/ })).toBeNull();
  });
});

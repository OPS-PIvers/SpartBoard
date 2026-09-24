import React, { useSyncExternalStore } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { WidgetHelpButton } from '@/components/help/WidgetHelpButton';
import { HELP_OPEN_EVENT } from '@/components/help/helpCenterState';
import { setTourRunning, TOUR_START_EVENT } from './tourState';
import {
  checkLiveTour,
  guideSetIds,
  TourOfferWatcher,
  useHasLiveTour,
} from './useTourOffers';
import { __resetPublishedToursForTests } from './publishedTours';

const h = vi.hoisted(() => {
  const board = {
    id: 'board-1',
    widgets: [] as { id: string; type: string }[],
    version: 0,
    listeners: new Set<() => void>(),
  };
  return {
    board,
    emit: () => {
      board.version++;
      board.listeners.forEach((l) => l());
    },
    addToast: vi.fn(),
    loadBuildingSet: vi.fn(),
    helpItems: [] as HelpResourceItem[],
    // Fake building_guided_learning_tours collection, keyed by doc id.
    tours: new Map<string, unknown>(),
    watchers: new Map<string, Set<(snap: unknown) => void>>(),
  };
});

const snapOf = (id: string) => ({
  exists: () => h.tours.has(id),
  data: () => h.tours.get(id),
});

// Publishes (or removes) a tour doc and tells its live listeners.
const writeTour = (id: string, data: unknown) => {
  if (data === undefined) h.tours.delete(id);
  else h.tours.set(id, data);
  h.watchers.get(id)?.forEach((cb) => cb(snapOf(id)));
};

vi.mock('@/config/firebase', () => ({ db: {}, isConfigured: true }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _coll: string, id: string) => ({ id }),
  getDoc: (ref: { id: string }) => Promise.resolve(snapOf(ref.id)),
  setDoc: vi.fn(),
  onSnapshot: (ref: { id: string }, next: (snap: unknown) => void) => {
    const set = h.watchers.get(ref.id) ?? new Set();
    h.watchers.set(ref.id, set);
    set.add(next);
    queueMicrotask(() => next(snapOf(ref.id)));
    return () => set.delete(next);
  },
}));

vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: h.loadBuildingSet,
}));

vi.mock('@/hooks/useHelpResources', () => ({
  useSharedHelpItems: () => h.helpItems,
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => {
    useSyncExternalStore(
      (l) => {
        h.board.listeners.add(l);
        return () => h.board.listeners.delete(l);
      },
      () => h.board.version
    );
    return {
      addToast: h.addToast,
      activeDashboard: { id: h.board.id, widgets: h.board.widgets },
    };
  },
}));

const guide = (
  id: string,
  setId: string,
  widgetTypes: string[]
): HelpResourceItem =>
  ({
    id,
    kind: 'guided-learning',
    setId,
    widgetTypes,
    title: id,
  }) as unknown as HelpResourceItem;

const tourSet = (id: string, withTour: boolean, stamp?: boolean) =>
  ({
    id,
    steps: [
      withTour
        ? { id: 's', tour: { anchor: 'sidebar.boards', action: 'click' } }
        : { id: 's' },
    ],
    ...(stamp === undefined ? {} : { hasLiveTour: stamp }),
  }) as unknown as GuidedLearningSet;

const withAuth = (ui: React.ReactElement, canTour = true) => (
  <AuthContext.Provider
    value={
      {
        canAccessFeature: (id: string) => canTour && id === 'gl-live-tours',
      } as unknown as AuthContextType
    }
  >
    {ui}
  </AuthContext.Provider>
);

const sets: Record<string, GuidedLearningSet> = {
  live: tourSet('live', true),
  plain: tourSet('plain', false),
  stamped: tourSet('stamped', false, true),
};

const published = (set: GuidedLearningSet) => ({
  set,
  publishedAt: 1,
  publishedBy: 'admin',
});

beforeEach(() => {
  __resetPublishedToursForTests();
  h.tours.clear();
  h.watchers.clear();
  h.tours.set('_meta', { seededAt: 1 });
  h.tours.set('live', published(sets.live));
  h.tours.set('plain', published(sets.plain));
  h.loadBuildingSet.mockReset();
  h.loadBuildingSet.mockImplementation((id: string) =>
    Promise.resolve(sets[id] ?? null)
  );
  h.addToast.mockReset();
  h.board.id = 'board-1';
  h.board.widgets = [];
  h.helpItems = [];
  localStorage.clear();
  setTourRunning(false);
});

afterEach(() => {
  setTourRunning(false);
});

describe('live tour lookup', () => {
  it('reads only published snapshots once the one-time publish ran', async () => {
    await expect(checkLiveTour('live')).resolves.toBe(true);
    await expect(checkLiveTour('plain')).resolves.toBe(false);
    await expect(checkLiveTour('stamped')).resolves.toBe(false);
    await expect(checkLiveTour('gone')).resolves.toBe(false);
    expect(h.loadBuildingSet).not.toHaveBeenCalled();
  });

  it('is not cached for the page: a newly published tour is found', async () => {
    await expect(checkLiveTour('stamped')).resolves.toBe(false);
    writeTour('stamped', published(tourSet('stamped', true)));
    await expect(checkLiveTour('stamped')).resolves.toBe(true);
  });

  it('falls back to the saved set until the one-time publish marker exists', async () => {
    h.tours.clear();
    await expect(checkLiveTour('live')).resolves.toBe(true);
    await expect(checkLiveTour('plain')).resolves.toBe(false);
    // A stamp without tour steps has nothing the runner could run.
    await expect(checkLiveTour('stamped')).resolves.toBe(false);
    expect(h.loadBuildingSet).toHaveBeenCalledTimes(3);
  });

  it('picks guide sets for a widget type', () => {
    const items = [
      guide('a', 'live', ['clock']),
      guide('b', 'plain', ['dice']),
      { ...guide('c', 'x', ['clock']), kind: 'embed' } as HelpResourceItem,
    ];
    expect(guideSetIds(items, 'clock')).toEqual(['live']);
    expect(guideSetIds(items)).toEqual(['live', 'plain']);
  });
});

describe('WidgetHelpButton', () => {
  const widget = { id: 'w1', type: 'clock' as const };

  it('opens guides straight away when no guide has a live tour', async () => {
    const opened = vi.fn();
    window.addEventListener(HELP_OPEN_EVENT, opened);
    const onClose = vi.fn();
    render(
      withAuth(
        <WidgetHelpButton
          widget={widget}
          helpItems={[guide('a', 'plain', ['clock'])]}
          onClose={onClose}
        />
      )
    );
    await waitFor(() => expect(h.watchers.has('plain')).toBe(true));
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Guides for this widget' })
    );
    expect(opened).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    window.removeEventListener(HELP_OPEN_EVENT, opened);
  });

  it('offers the live tour or the guides when one exists', async () => {
    const started = vi.fn();
    window.addEventListener(TOUR_START_EVENT, started);
    const onClose = vi.fn();
    render(
      withAuth(
        <WidgetHelpButton
          widget={widget}
          helpItems={[
            guide('a', 'plain', ['clock']),
            guide('b', 'live', ['clock']),
          ]}
          onClose={onClose}
        />
      )
    );
    const button = screen.getByRole('button', {
      name: 'Guides for this widget',
    });
    await waitFor(() =>
      expect(button).toHaveAttribute('aria-haspopup', 'menu')
    );
    fireEvent.click(button);
    expect(screen.getByRole('menuitem', { name: 'Open guides' })).toBeVisible();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show me live' }));
    expect(
      (started.mock.calls[0][0] as CustomEvent<{ setId: string }>).detail
    ).toEqual({ setId: 'live' });
    expect(onClose).toHaveBeenCalled();
    window.removeEventListener(TOUR_START_EVENT, started);
  });

  it('never looks up tours without the flag', () => {
    render(
      withAuth(
        <WidgetHelpButton
          widget={widget}
          helpItems={[guide('b', 'live', ['clock'])]}
          onClose={vi.fn()}
        />,
        false
      )
    );
    expect(h.watchers.size).toBe(0);
    expect(h.loadBuildingSet).not.toHaveBeenCalled();
  });
});

describe('useHasLiveTour', () => {
  const Probe: React.FC<{ setId: string }> = ({ setId }) => (
    <span>{useHasLiveTour(setId) ? 'tour' : 'no tour'}</span>
  );

  it('ignores Studio edits until they are published', async () => {
    h.tours.delete('stamped');
    render(withAuth(<Probe setId="stamped" />));
    await act(async () => {
      await Promise.resolve();
    });
    // The saved set has a tour, but nothing is published.
    expect(screen.getByText('no tour')).toBeInTheDocument();
    expect(h.loadBuildingSet).not.toHaveBeenCalled();
    act(() => writeTour('stamped', published(tourSet('stamped', true))));
    expect(screen.getByText('tour')).toBeInTheDocument();
    act(() => writeTour('stamped', published(tourSet('stamped', false))));
    expect(screen.getByText('no tour')).toBeInTheDocument();
  });

  it('keeps an unpublished tour offered before the one-time publish ran', async () => {
    h.tours.clear();
    render(withAuth(<Probe setId="live" />));
    expect(await screen.findByText('tour')).toBeInTheDocument();
    expect(h.loadBuildingSet).toHaveBeenCalledWith('live');
  });

  it('stays off without the flag', () => {
    render(withAuth(<Probe setId="live" />, false));
    expect(screen.getByText('no tour')).toBeInTheDocument();
    expect(h.watchers.size).toBe(0);
  });
});

describe('first-use tour offer', () => {
  const addWidget = (type: string) => {
    act(() => {
      h.board.widgets = [
        ...h.board.widgets,
        { id: `w${h.board.widgets.length}`, type },
      ];
      h.emit();
    });
  };

  it('offers a widget type once, the first time it is added', async () => {
    h.helpItems = [guide('a', 'live', ['clock'])];
    render(<TourOfferWatcher />);
    addWidget('clock');
    await waitFor(() => expect(h.addToast).toHaveBeenCalledTimes(1));
    const [message, type, action] = h.addToast.mock.calls[0] as [
      string,
      string,
      { label: string; onClick: () => void },
    ];
    expect(message).toBe('Take a 1-minute tour of Clock?');
    expect(type).toBe('info');
    expect(action.label).toBe('Start');
    const started = vi.fn();
    window.addEventListener(TOUR_START_EVENT, started);
    action.onClick();
    expect(started).toHaveBeenCalledTimes(1);
    window.removeEventListener(TOUR_START_EVENT, started);
    expect(localStorage.getItem('spart_tour_offered_clock')).toBe('1');

    act(() => {
      h.board.widgets = [];
      h.emit();
    });
    addWidget('clock');
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.addToast).toHaveBeenCalledTimes(1);
  });

  it('marks the offer shown only after Start or No thanks', async () => {
    h.helpItems = [guide('a', 'live', ['clock'])];
    render(<TourOfferWatcher />);
    const readd = () => {
      act(() => {
        h.board.widgets = [];
        h.emit();
      });
      addWidget('clock');
    };
    addWidget('clock');
    await waitFor(() => expect(h.addToast).toHaveBeenCalledTimes(1));
    // Ignored: nothing is stored, so the offer comes back next time.
    expect(localStorage.getItem('spart_tour_offered_clock')).toBeNull();
    readd();
    await waitFor(() => expect(h.addToast).toHaveBeenCalledTimes(2));
    const action = h.addToast.mock.calls[1][2] as {
      secondary: { label: string; onClick: () => void };
    };
    expect(action.secondary.label).toBe('No thanks');
    action.secondary.onClick();
    expect(localStorage.getItem('spart_tour_offered_clock')).toBe('1');
    readd();
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.addToast).toHaveBeenCalledTimes(2);
  });

  it('stays quiet for types without a live tour, board switches and running tours', async () => {
    h.helpItems = [
      guide('a', 'live', ['clock']),
      guide('b', 'plain', ['dice']),
    ];
    render(<TourOfferWatcher />);
    addWidget('dice');
    act(() => {
      h.board.id = 'board-2';
      h.board.widgets = [{ id: 'x', type: 'clock' }];
      h.emit();
    });
    setTourRunning(true);
    act(() => {
      h.board.widgets = [];
      h.emit();
    });
    addWidget('clock');
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.addToast).not.toHaveBeenCalled();
    expect(localStorage.getItem('spart_tour_offered_clock')).toBeNull();
  });
});

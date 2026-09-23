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
  __resetLiveTourCacheForTests,
  checkLiveTour,
  guideSetIds,
  TourOfferWatcher,
} from './useTourOffers';

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
  };
});

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

beforeEach(() => {
  __resetLiveTourCacheForTests();
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
  it('reads the stamp, falls back to steps, and loads each set once', async () => {
    await expect(checkLiveTour('live')).resolves.toBe(true);
    await expect(checkLiveTour('plain')).resolves.toBe(false);
    await expect(checkLiveTour('stamped')).resolves.toBe(true);
    await expect(checkLiveTour('gone')).resolves.toBe(false);
    await checkLiveTour('live');
    expect(h.loadBuildingSet).toHaveBeenCalledTimes(4);
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
    await waitFor(() => expect(h.loadBuildingSet).toHaveBeenCalled());
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
    expect(h.loadBuildingSet).not.toHaveBeenCalled();
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

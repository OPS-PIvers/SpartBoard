import React, { useSyncExternalStore } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourAttr, tourTypeAttr } from '@/config/tourAnchors';
import type { GuidedLearningSet, WidgetType } from '@/types';
import { LiveTourRunner } from './LiveTourRunner';
import { requestStartTour } from './tourState';
import { ANCHOR_SEARCH_MS } from './useAnchorElement';

const h = vi.hoisted(() => {
  type Widget = { id: string; type: string };
  const board = {
    id: 'board-1',
    widgets: [] as Widget[],
    readOnly: false,
    version: 0,
    listeners: new Set<() => void>(),
  };
  const emit = () => {
    board.version++;
    board.listeners.forEach((l) => l());
  };
  let n = 0;
  const actions = {
    addWidget: vi.fn((type: string) => {
      board.widgets = [...board.widgets, { id: `w${++n}`, type }];
      emit();
    }),
    removeWidgets: vi.fn((ids: string[]) => {
      board.widgets = board.widgets.filter((w) => !ids.includes(w.id));
      emit();
    }),
    addToast: vi.fn(),
    createNewDashboard: vi.fn((_name: string) => {
      board.id = 'practice';
      board.widgets = [];
      board.readOnly = false;
      emit();
      return Promise.resolve('practice');
    }),
  };
  const reset = () => {
    board.id = 'board-1';
    board.widgets = [];
    board.readOnly = false;
    n = 0;
    Object.values(actions).forEach((fn) => fn.mockClear());
  };
  return {
    board,
    actions,
    reset,
    canAccess: vi.fn(() => true),
    loadBuildingSet: vi.fn(),
  };
});

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: h.canAccess }),
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
      ...h.actions,
      isActiveBoardReadOnly: h.board.readOnly,
      activeDashboard: { id: h.board.id, widgets: h.board.widgets },
    };
  },
}));

vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: h.loadBuildingSet,
}));

type Binding = { anchor: string; action: 'click' | 'observe' };

const makeSet = (
  steps: Binding[],
  setupWidgets: WidgetType[] = []
): GuidedLearningSet =>
  ({
    id: 'set-1',
    title: 'Tour',
    imageUrls: [],
    steps: [
      { id: 'intro', label: 'Not a tour step' },
      ...steps.map((tour, i) => ({
        id: `s${i}`,
        label: `Step ${i + 1}`,
        tour,
      })),
    ],
    tourSetup: { widgets: setupWidgets },
  }) as unknown as GuidedLearningSet;

// A stand-in board that renders the anchors a tour needs.
const Fixture: React.FC = () => {
  const widgets = useSyncExternalStore(
    (l) => {
      h.board.listeners.add(l);
      return () => h.board.listeners.delete(l);
    },
    () => h.board.widgets
  );
  return (
    <div>
      <button {...tourTypeAttr('dock.item', 'dice')}>Dice</button>
      <button {...tourAttr('sidebar.boards')}>Boards</button>
      <button>Elsewhere</button>
      {widgets.map((w) => (
        <div key={w.id} {...tourAttr('widget.window', w.id)}>
          <button {...tourAttr('widget.settings-opener', w.id)}>
            Settings {w.id}
          </button>
        </div>
      ))}
    </div>
  );
};

const frames = async (ms = 50) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const start = async (set: GuidedLearningSet) => {
  h.loadBuildingSet.mockResolvedValue(set);
  render(
    <>
      <Fixture />
      <LiveTourRunner />
    </>
  );
  act(() => {
    requestStartTour({ setId: set.id });
  });
  await frames();
};

const progress = () => screen.getByText(/^\d+ \/ \d+$/).textContent;

beforeEach(() => {
  h.loadBuildingSet.mockReset();
  vi.useFakeTimers();
  h.reset();
  h.canAccess.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LiveTourRunner', () => {
  it('adds a missing setup widget, anchors to it, and removes it on teardown', async () => {
    h.board.widgets = [{ id: 'mine', type: 'dice' }];
    await start(
      makeSet(
        [{ anchor: 'widget.settings-opener', action: 'observe' }],
        ['dice', 'clock']
      )
    );
    expect(h.actions.addWidget).toHaveBeenCalledTimes(1);
    expect(h.actions.addWidget).toHaveBeenCalledWith('clock');
    expect(progress()).toBe('1 / 1');
    const ring = screen.getByTestId('tour-spotlight-ring');
    expect(ring).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText("Keep the tour's widgets?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove them' }));
    expect(h.actions.removeWidgets).toHaveBeenCalledWith(['w1']);
    expect(h.board.widgets.map((w) => w.id)).toEqual(['mine']);
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });

  it('prefers the tour-added widget for per-widget anchors', async () => {
    h.board.widgets = [{ id: 'mine', type: 'clock' }];
    await start(
      makeSet([{ anchor: 'widget.settings-opener', action: 'click' }], ['dice'])
    );
    fireEvent.click(screen.getByText('Settings mine'));
    await frames();
    expect(progress()).toBe('1 / 1');
    fireEvent.click(screen.getByText('Settings w1'));
    await frames();
    expect(screen.getByText("Keep the tour's widgets?")).toBeInTheDocument();
  });

  it('keeps the added widgets when asked', async () => {
    await start(
      makeSet([{ anchor: 'sidebar.boards', action: 'observe' }], ['dice'])
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep them' }));
    expect(h.actions.removeWidgets).not.toHaveBeenCalled();
    expect(h.board.widgets).toHaveLength(1);
  });

  it('tracks the anchor when it moves', async () => {
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'observe' }]));
    const target = screen.getByText('Boards');
    let x = 100;
    vi.spyOn(target, 'getBoundingClientRect').mockImplementation(
      () => ({ x, y: 40, width: 80, height: 30 }) as DOMRect
    );
    await frames();
    const ring = () => screen.getByTestId('tour-spotlight-ring');
    expect(ring().getAttribute('x')).toBe('94');
    x = 300;
    await frames();
    expect(ring().getAttribute('x')).toBe('294');
  });

  it('advances on a click on the anchor but not elsewhere', async () => {
    await start(
      makeSet([
        { anchor: 'dock.item:dice', action: 'click' },
        { anchor: 'sidebar.boards', action: 'click' },
      ])
    );
    expect(progress()).toBe('1 / 2');
    fireEvent.click(screen.getByText('Elsewhere'));
    fireEvent.click(screen.getByText('Boards'));
    await frames();
    expect(progress()).toBe('1 / 2');
    fireEvent.click(screen.getByText('Dice'));
    await frames();
    expect(progress()).toBe('2 / 2');
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    await frames();
    expect(progress()).toBe('1 / 2');
  });

  it('waits for Next on an observe step', async () => {
    await start(
      makeSet([
        { anchor: 'sidebar.boards', action: 'observe' },
        { anchor: 'dock.item:dice', action: 'observe' },
      ])
    );
    fireEvent.click(screen.getByText('Boards'));
    await frames();
    expect(progress()).toBe('1 / 2');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(progress()).toBe('2 / 2');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });

  it('says so when the anchor never appears, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await start(makeSet([{ anchor: 'sidebar.classes', action: 'click' }]));
    expect(screen.getByText('Finding it on your screen…')).toBeInTheDocument();
    await frames(ANCHOR_SEARCH_MS + 100);
    expect(
      screen.getByText(/Couldn't find this on your screen/)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith('Live tour anchor not found', {
      setId: 'set-1',
      stepId: 's0',
      anchor: 'sidebar.classes',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Finding it on your screen…')).toBeInTheDocument();
    warn.mockRestore();
  });

  it('exits on Escape and offers teardown', async () => {
    await start(
      makeSet([{ anchor: 'sidebar.boards', action: 'click' }], ['dice'])
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText("Keep the tour's widgets?")).toBeInTheDocument();
  });

  it('exits on Escape with nothing to tear down', async () => {
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'click' }]));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });

  it('offers a practice board when the board is view-only', async () => {
    h.board.readOnly = true;
    await start(
      makeSet([{ anchor: 'sidebar.boards', action: 'click' }], ['dice'])
    );
    expect(h.actions.addWidget).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Start on a practice board' })
    );
    await frames();
    expect(h.actions.createNewDashboard).toHaveBeenCalledWith('Tour practice');
    expect(h.actions.addWidget).toHaveBeenCalledWith('dice');
    expect(progress()).toBe('1 / 1');
  });

  it('stops with a message if the practice board never opens', async () => {
    h.board.readOnly = true;
    h.actions.createNewDashboard.mockImplementationOnce(() =>
      Promise.resolve('practice')
    );
    await start(
      makeSet([{ anchor: 'sidebar.boards', action: 'click' }], ['dice'])
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Start on a practice board' })
    );
    await frames(2500);
    expect(h.actions.addWidget).not.toHaveBeenCalled();
    expect(h.actions.addToast).toHaveBeenCalledWith(
      "Couldn't open the practice board. Try the tour again.",
      'error'
    );
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });

  it('ignores a second start while a tour is open', async () => {
    await start(
      makeSet([{ anchor: 'sidebar.boards', action: 'observe' }], ['dice'])
    );
    h.loadBuildingSet.mockResolvedValue(
      makeSet([
        { anchor: 'sidebar.boards', action: 'observe' },
        { anchor: 'dock.item:dice', action: 'observe' },
      ])
    );
    act(() => {
      requestStartTour({ setId: 'set-2' });
    });
    await frames();
    expect(h.loadBuildingSet).toHaveBeenCalledTimes(1);
    expect(progress()).toBe('1 / 1');
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    expect(screen.getByText("Keep the tour's widgets?")).toBeInTheDocument();
  });

  it('ignores start requests without the flag', async () => {
    h.canAccess.mockReturnValue(false);
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'click' }]));
    expect(h.loadBuildingSet).not.toHaveBeenCalled();
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });

  it('toasts when the set has no tour steps', async () => {
    await start(makeSet([]));
    expect(h.actions.addToast).toHaveBeenCalledWith(
      "This tour isn't available right now.",
      'error'
    );
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });
});

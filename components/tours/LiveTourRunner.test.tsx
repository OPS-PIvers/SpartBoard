import React, { useSyncExternalStore } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourAttr, tourTypeAttr } from '@/config/tourAnchors';
import type { GuidedLearningSet, WidgetType } from '@/types';
import { LiveTourRunner } from './LiveTourRunner';
import { TRY_HINT_MS } from '@/components/widgets/GuidedLearning/components/player/playback';
import {
  requestStartTour,
  setTourRunning,
  TOUR_OPEN_STUDIO_EVENT,
} from './tourState';
import { ANCHOR_SEARCH_MS } from './useAnchorElement';
import { tourHealthOf } from './tourHealth';
import { SAVED_TOUR_KEY } from './tourResume';
import {
  clearTourLayoutOverrides,
  clearTourWidgetPatches,
  getTourLayoutOverrides,
  getTourWidgetPatches,
  useTourWidgetPatch,
} from '@/context/dashboardCanvasStore';
import { TOUR_DOCK_EVENT, type TourDockRequest } from './tourPrerequisites';
import { Z_INDEX } from '@/config/zIndex';

const h = vi.hoisted(() => {
  type Widget = {
    id: string;
    type: string;
    z?: number;
    transient?: boolean;
    minimized?: boolean;
  };
  const board = {
    id: 'board-1',
    widgets: [] as Widget[],
    selectedWidgetId: null as string | null,
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
    addTourWidget: vi.fn((type: string, _layout?: object) => {
      const id = `t${++n}`;
      board.widgets = [...board.widgets, { id, type, transient: true }];
      emit();
      return id;
    }),
    commitTourWidgets: vi.fn((ids: readonly string[]) => {
      board.widgets = board.widgets.map((w) =>
        ids.includes(w.id) ? { id: w.id, type: w.type } : w
      );
      emit();
    }),
    discardTourWidgets: vi.fn((ids: readonly string[]) => {
      board.widgets = board.widgets.filter(
        (w) => !(w.transient && ids.includes(w.id))
      );
      emit();
    }),
    addToast: vi.fn(),
    setSelectedWidgetId: vi.fn((id: string | null) => {
      board.selectedWidgetId = id;
      emit();
    }),
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
    board.selectedWidgetId = null;
    n = 0;
    Object.values(actions).forEach((fn) => fn.mockClear());
  };
  return {
    board,
    actions,
    reset,
    canAccess: vi.fn(() => true),
    loadTour: vi.fn(),
    loadDraft: vi.fn(),
    user: null as { uid: string } | null,
    runLog: {
      update: vi.fn(),
      miss: vi.fn(),
      end: vi.fn(),
      flush: vi.fn(),
    },
    startRunLog: vi.fn(),
  };
});

vi.mock('./tourRuns', () => ({
  startTourRunLog: (...args: unknown[]) => {
    h.startRunLog(...args);
    return h.runLog;
  },
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: h.canAccess, user: h.user }),
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
      selectedWidgetId: h.board.selectedWidgetId,
      activeDashboard: { id: h.board.id, widgets: h.board.widgets },
    };
  },
}));

vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: h.loadDraft,
}));

vi.mock('./publishedTours', () => ({
  loadRunnableTour: h.loadTour,
}));

vi.mock('./TourMiniPlayer', () => ({
  default: ({ step }: { step: { id: string } }) => (
    <div data-testid="tour-mini-player">{step.id}</div>
  ),
}));

type Binding = {
  anchor: string;
  action: 'click' | 'observe';
  teacherMustClick?: boolean;
  fallback?: { role: string; name: string };
};

const makeSet = (
  steps: Binding[],
  setupWidgets: WidgetType[] = [],
  mode: GuidedLearningSet['mode'] = 'structured'
): GuidedLearningSet =>
  ({
    id: 'set-1',
    title: 'Tour',
    mode,
    imageUrls: [],
    steps: [
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
      <div hidden>
        <input {...tourAttr('library.search')} aria-label="Search" />
      </div>
      <button>Elsewhere</button>
      {widgets.map((w) => (
        <div key={w.id} {...tourAttr('widget.window', w.id)}>
          <button {...tourAttr('widget.settings-opener', w.id, w.type)}>
            Settings {w.id}
          </button>
          <button {...tourAttr('widget.close', w.id)}>Close {w.id}</button>
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
  h.loadTour.mockResolvedValue(set);
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

const scrollIntoView = vi.fn();

beforeEach(() => {
  // jsdom has no layout: anything under [hidden] is zero-size, the rest is a 40px box.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const size = this.closest('[hidden]') ? 0 : 40;
      return new DOMRect(10, 10, size, size);
    }
  );
  scrollIntoView.mockClear();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  h.loadTour.mockReset();
  h.loadDraft.mockReset();
  vi.useFakeTimers();
  h.reset();
  h.canAccess.mockReturnValue(true);
  h.user = null;
  h.startRunLog.mockClear();
  Object.values(h.runLog).forEach((fn) => fn.mockClear());
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

// Adds step fields (text, cursor, imageIndex) to a set's tour steps, in order.
const withSteps = (
  set: GuidedLearningSet,
  extras: Record<string, unknown>[],
  imageUrls: string[] = []
): GuidedLearningSet =>
  ({
    ...set,
    imageUrls,
    steps: set.steps.map((st) =>
      st.id.startsWith('s') ? { ...st, ...extras[Number(st.id.slice(1))] } : st
    ),
  }) as GuidedLearningSet;

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

  it('tears down only the widget it added, not a same-type one added mid-tour', async () => {
    await start(
      makeSet([{ anchor: 'sidebar.boards', action: 'observe' }], ['dice'])
    );
    expect(h.board.widgets.map((w) => w.id)).toEqual(['w1']);
    act(() => h.actions.addWidget('dice'));
    await frames();
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove them' }));
    expect(h.actions.removeWidgets).toHaveBeenCalledWith(['w1']);
    expect(h.board.widgets.map((w) => w.id)).toEqual(['w2']);
  });

  it('treats a hidden anchor as missing and shows the slide', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await start(
      withSteps(
        makeSet([{ anchor: 'library.search', action: 'click' }]),
        [{ imageIndex: 0 }],
        ['https://example.com/slide.png']
      )
    );
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument();
    await frames(ANCHOR_SEARCH_MS + 100);
    await frames();
    expect(screen.getByTestId('tour-mini-player')).toBeInTheDocument();
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument();
  });

  it('scrolls the anchor into view once, when first found', async () => {
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'observe' }]));
    await frames();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByText('Boards'));
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
    fireEvent.scroll(window);
    await frames();
    expect(ring().getAttribute('x')).toBe('294');
  });

  it('continues without Retry when a missing anchor appears late', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await start(
      withSteps(
        makeSet([
          { anchor: 'sidebar.classes', action: 'click' },
          { anchor: 'sidebar.boards', action: 'observe' },
        ]),
        [{ imageIndex: 0 }],
        ['https://example.com/slide.png']
      )
    );
    await frames(ANCHOR_SEARCH_MS + 100);
    expect(screen.getByTestId('tour-mini-player')).toBeInTheDocument();
    await frames(5000 - ANCHOR_SEARCH_MS - 150);
    const late = document.createElement('button');
    late.setAttribute('data-tour', 'sidebar.classes');
    late.textContent = 'My Classes';
    act(() => {
      document.body.appendChild(late);
    });
    await frames(300);
    expect(screen.getByTestId('tour-spotlight')).toBeInTheDocument();
    expect(screen.queryByTestId('tour-mini-player')).not.toBeInTheDocument();
    fireEvent.click(late);
    await frames();
    expect(progress()).toBe('2 / 2');
    late.remove();
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

  it('leaves Escape inside an app panel to that panel', async () => {
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'click' }]));
    const panel = document.createElement('div');
    panel.setAttribute('data-widget-portal', '');
    const input = document.createElement('input');
    panel.appendChild(input);
    document.body.appendChild(panel);
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.getByTestId('live-tour')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('tour-callout'), { key: 'Escape' });
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
    panel.remove();
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
    h.loadTour.mockResolvedValue(
      makeSet([
        { anchor: 'sidebar.boards', action: 'observe' },
        { anchor: 'dock.item:dice', action: 'observe' },
      ])
    );
    act(() => {
      requestStartTour({ setId: 'set-2' });
    });
    await frames();
    expect(h.loadTour).toHaveBeenCalledTimes(1);
    expect(progress()).toBe('1 / 1');
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    expect(screen.getByText("Keep the tour's widgets?")).toBeInTheDocument();
  });

  it('runs the published snapshot, never the saved draft, from a launch point', async () => {
    h.loadDraft.mockResolvedValue(
      makeSet([
        { anchor: 'sidebar.boards', action: 'observe' },
        { anchor: 'dock.item:dice', action: 'observe' },
      ])
    );
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'observe' }]));
    expect(h.loadTour).toHaveBeenCalledWith('set-1');
    expect(h.loadDraft).not.toHaveBeenCalled();
    expect(progress()).toBe('1 / 1');
  });

  it('runs the saved set for a Studio preview', async () => {
    h.loadDraft.mockResolvedValue(
      makeSet([
        { anchor: 'sidebar.boards', action: 'observe' },
        { anchor: 'dock.item:dice', action: 'observe' },
      ])
    );
    render(
      <>
        <Fixture />
        <LiveTourRunner />
      </>
    );
    act(() => {
      requestStartTour({ setId: 'set-1', draft: true });
    });
    await frames();
    expect(h.loadTour).not.toHaveBeenCalled();
    expect(progress()).toBe('1 / 2');
  });

  it('says the tour is unavailable when nothing is published', async () => {
    h.loadTour.mockResolvedValue(null);
    render(<LiveTourRunner />);
    act(() => {
      requestStartTour({ setId: 'set-1' });
    });
    await frames();
    expect(h.actions.addToast).toHaveBeenCalledWith(
      expect.any(String),
      'error'
    );
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });

  it('forgets the Studio return of a Studio run that fails to load', async () => {
    const open = vi.fn();
    window.addEventListener(TOUR_OPEN_STUDIO_EVENT, open);
    h.loadDraft.mockResolvedValue(null);
    render(
      <>
        <Fixture />
        <LiveTourRunner />
      </>
    );
    act(() => {
      requestStartTour({ setId: 'set-1', draft: true, returnToStepId: 's0' });
    });
    await frames();
    expect(h.actions.addToast).toHaveBeenCalledWith(
      "This tour isn't available right now.",
      'error'
    );
    act(() => {
      setTourRunning(true);
      setTourRunning(false);
    });
    window.removeEventListener(TOUR_OPEN_STUDIO_EVENT, open);
    expect(open).not.toHaveBeenCalled();
  });

  it('ignores start requests without the flag', async () => {
    h.canAccess.mockReturnValue(false);
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'click' }]));
    expect(h.loadTour).not.toHaveBeenCalled();
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

describe('LiveTourRunner polish', () => {
  const cursor = () => screen.queryByTestId('gl-cursor');

  it('hints with the cursor after 5s on a click step', async () => {
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'click' }]));
    await frames();
    await frames(TRY_HINT_MS - 200);
    expect(cursor()).not.toBeInTheDocument();
    await frames(200);
    expect(cursor()).toBeInTheDocument();
  });

  it('replays the move once after Show me, not on later steps', async () => {
    await start(
      makeSet([
        { anchor: 'dock.item:dice', action: 'click' },
        { anchor: 'sidebar.boards', action: 'click' },
      ])
    );
    await frames();
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    await frames();
    expect(cursor()).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dice'));
    await frames();
    expect(progress()).toBe('2 / 2');
    await frames();
    expect(cursor()).not.toBeInTheDocument();
  });

  it('keeps the cursor off observe steps and steps that hide it', async () => {
    await start(
      withSteps(
        makeSet([
          { anchor: 'sidebar.boards', action: 'observe' },
          { anchor: 'dock.item:dice', action: 'click' },
        ]),
        [{}, { cursor: { hide: true } }]
      )
    );
    expect(
      screen.queryByRole('button', { name: 'Show me' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames(TRY_HINT_MS + 100);
    expect(progress()).toBe('2 / 2');
    expect(
      screen.queryByRole('button', { name: 'Show me' })
    ).not.toBeInTheDocument();
    expect(cursor()).not.toBeInTheDocument();
  });

  it('renders bold and links in step text', async () => {
    await start(
      withSteps(makeSet([{ anchor: 'sidebar.boards', action: 'observe' }]), [
        { text: 'Open **Boards** or [read more](https://example.com)' },
      ])
    );
    expect(screen.getByText('Boards', { selector: 'strong' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'read more' })).toHaveAttribute(
      'href',
      'https://example.com'
    );
  });

  it("shows the step's slide when its anchor is missing", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await start(
      withSteps(
        makeSet([{ anchor: 'sidebar.classes', action: 'click' }]),
        [{ imageIndex: 0 }],
        ['https://example.com/slide.png']
      )
    );
    await frames(ANCHOR_SEARCH_MS + 100);
    await frames();
    expect(screen.getByTestId('tour-mini-player')).toHaveTextContent('s0');
    expect(
      screen.getByText(
        "Couldn't find this on your screen. Here's what it looks like."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('reads each step aloud once turned on', async () => {
    const speak = vi.fn<(u: { text: string }) => void>();
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      }
    );
    await start(
      withSteps(
        makeSet([
          { anchor: 'sidebar.boards', action: 'observe' },
          { anchor: 'dock.item:dice', action: 'observe' },
        ]),
        [{ text: 'Your **boards** live here.' }, { text: 'Add dice.' }]
      )
    );
    expect(speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    expect(speak.mock.calls[0][0].text).toBe('Step 1. Your boards live here.');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(speak.mock.calls[1][0].text).toBe('Step 2. Add dice.');
  });

  it('skips the callout animation under reduced motion', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'click' }]));
    expect(screen.getByTestId('tour-callout').style.animation).toBe('');
    await frames();
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    await frames();
    expect(cursor()).toHaveAttribute('data-arrived', 'true');
  });

  it('animates the callout in by default', async () => {
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'click' }]));
    expect(screen.getByTestId('tour-callout').style.animation).toContain(
      'gl-callout-in'
    );
  });
});

describe('LiveTourRunner modes', () => {
  const status = () => screen.queryByTestId('tour-auto-status');
  // Steps in small slices so each render's timers get scheduled.
  const run = async (ms = 50) => {
    for (let t = 0; t < ms; t += 50) await frames(Math.min(50, ms - t));
  };
  const AUTO_TYPES = [
    'pointerover',
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
  ];
  const recordEvents = (el: HTMLElement) => {
    const seen: string[] = [];
    AUTO_TYPES.forEach((type) =>
      el.addEventListener(type, () => seen.push(type))
    );
    return seen;
  };

  it('Structured: Next always shows and advances a click step', async () => {
    await start(
      makeSet([
        { anchor: 'dock.item:dice', action: 'click' },
        { anchor: 'sidebar.boards', action: 'click' },
      ])
    );
    const clicks = recordEvents(screen.getByText('Dice'));
    await run(10_000);
    expect(clicks).toEqual([]);
    expect(progress()).toBe('1 / 2');
    expect(status()).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Take over' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(progress()).toBe('2 / 2');
  });

  it('Guided: glides, clicks with a full pointer sequence, waits for the next anchor, continues', async () => {
    await start(
      makeSet(
        [
          { anchor: 'dock.item:dice', action: 'click' },
          { anchor: 'sidebar.boards', action: 'click' },
        ],
        [],
        'guided'
      )
    );
    const dice = recordEvents(screen.getByText('Dice'));
    await frames();
    expect(status()).toHaveTextContent('Playing each step for you');
    await run(1000);
    expect(dice).toEqual([]);
    await run(1000);
    expect(screen.getByTestId('gl-cursor')).toBeInTheDocument();
    await run(2000);
    expect(dice).toEqual(AUTO_TYPES);
    expect(progress()).toBe('2 / 2');
    const boards = recordEvents(screen.getByText('Boards'));
    await run(4000);
    expect(boards).toEqual(AUTO_TYPES);
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });

  it('Guided: observe steps move on at reading pace', async () => {
    await start(
      makeSet(
        [
          { anchor: 'sidebar.boards', action: 'observe' },
          { anchor: 'dock.item:dice', action: 'observe' },
        ],
        [],
        'guided'
      )
    );
    await run(2800);
    expect(progress()).toBe('1 / 2');
    await run(400);
    expect(progress()).toBe('2 / 2');
  });

  it('Guided: a destructive anchor is demonstrated, then left to the teacher', async () => {
    await start(
      makeSet(
        [
          { anchor: 'widget.close', action: 'click' },
          { anchor: 'sidebar.boards', action: 'observe' },
        ],
        ['dice'],
        'guided'
      )
    );
    const close = recordEvents(screen.getByText('Close w1'));
    await run(4000);
    expect(close).toEqual([]);
    expect(progress()).toBe('1 / 2');
    expect(status()).toHaveTextContent('Your turn: click the highlighted spot');
    fireEvent.click(screen.getByText('Close w1'));
    await frames();
    expect(progress()).toBe('2 / 2');
  });

  it('Guided: a fallback-only step is found by role and name, then left to the teacher', async () => {
    await start(
      makeSet(
        [
          {
            anchor: '',
            action: 'click',
            fallback: { role: 'button', name: 'Elsewhere' },
          },
          { anchor: 'sidebar.boards', action: 'observe' },
        ],
        [],
        'guided'
      )
    );
    const elsewhere = recordEvents(screen.getByText('Elsewhere'));
    await run(4000);
    expect(elsewhere).toEqual([]);
    expect(progress()).toBe('1 / 2');
    expect(status()).toHaveTextContent('Your turn: click the highlighted spot');
    fireEvent.click(screen.getByText('Elsewhere'));
    await frames();
    expect(progress()).toBe('2 / 2');
  });

  it('Guided: teacherMustClick overrides the anchor default both ways', async () => {
    await start(
      makeSet(
        [
          { anchor: 'widget.close', action: 'click', teacherMustClick: false },
          { anchor: 'dock.item:dice', action: 'click', teacherMustClick: true },
          { anchor: 'sidebar.boards', action: 'observe' },
        ],
        ['clock'],
        'guided'
      )
    );
    const close = recordEvents(screen.getByText('Close w1'));
    const dice = recordEvents(screen.getByText('Dice'));
    await run(4000);
    expect(close).toEqual(AUTO_TYPES);
    expect(progress()).toBe('2 / 3');
    await run(4000);
    expect(dice).toEqual([]);
    expect(status()).toHaveTextContent('Your turn');
  });

  it('Guided: Take over switches the rest of the run to Structured', async () => {
    await start(
      makeSet(
        [
          { anchor: 'dock.item:dice', action: 'click' },
          { anchor: 'sidebar.boards', action: 'click' },
        ],
        [],
        'guided'
      )
    );
    const dice = recordEvents(screen.getByText('Dice'));
    const boards = recordEvents(screen.getByText('Boards'));
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    await run(TRY_HINT_MS + 3000);
    expect(dice).toEqual([]);
    expect(status()).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Take over' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show me' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dice'));
    await frames();
    expect(progress()).toBe('2 / 2');
    await run(8000);
    expect(boards).toEqual([]);
    expect(progress()).toBe('2 / 2');
  });

  it('Guided: Pause holds the step and Resume continues', async () => {
    await start(
      makeSet(
        [
          { anchor: 'dock.item:dice', action: 'click' },
          { anchor: 'sidebar.boards', action: 'observe' },
        ],
        [],
        'guided'
      )
    );
    const dice = recordEvents(screen.getByText('Dice'));
    await run(1800);
    expect(screen.getByTestId('gl-cursor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await run(6000);
    expect(dice).toEqual([]);
    expect(status()).toHaveTextContent('Paused');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await run(4000);
    expect(dice).toEqual(AUTO_TYPES);
    expect(progress()).toBe('2 / 2');
  });

  it('Guided: Pause after the auto-click holds the step, and Resume moves on', async () => {
    await start(
      makeSet(
        [
          { anchor: 'dock.item:dice', action: 'click' },
          { anchor: 'sidebar.classes', action: 'click' },
        ],
        [],
        'guided'
      )
    );
    const dice = recordEvents(screen.getByText('Dice'));
    await run(4000);
    expect(dice).toEqual(AUTO_TYPES);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await run(ANCHOR_SEARCH_MS + 1000);
    expect(progress()).toBe('1 / 2');
    expect(status()).toHaveTextContent('Paused');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await frames();
    expect(progress()).toBe('2 / 2');
  });

  it('Guided: Take over after the auto-click stops the pending advance', async () => {
    await start(
      makeSet(
        [
          { anchor: 'dock.item:dice', action: 'click' },
          { anchor: 'sidebar.classes', action: 'click' },
        ],
        [],
        'guided'
      )
    );
    const dice = recordEvents(screen.getByText('Dice'));
    await run(4000);
    expect(dice).toEqual(AUTO_TYPES);
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    await run(ANCHOR_SEARCH_MS + 1000);
    expect(progress()).toBe('1 / 2');
    expect(status()).not.toBeInTheDocument();
  });

  it('Guided: falls back to the teacher when the click does not bring up the next anchor', async () => {
    await start(
      makeSet(
        [
          { anchor: 'dock.item:dice', action: 'click' },
          { anchor: 'sidebar.classes', action: 'click' },
        ],
        [],
        'guided'
      )
    );
    const dice = recordEvents(screen.getByText('Dice'));
    await run(4000);
    expect(dice).toEqual(AUTO_TYPES);
    expect(progress()).toBe('1 / 2');
    await run(ANCHOR_SEARCH_MS);
    expect(progress()).toBe('1 / 2');
    expect(status()).toHaveTextContent('Click here to continue');
    await run(8000);
    expect(dice).toEqual(AUTO_TYPES);
    fireEvent.click(screen.getByText('Dice'));
    await frames();
    expect(progress()).toBe('2 / 2');
  });
});

describe('LiveTourRunner plain steps and welcome', () => {
  const run = async (ms = 50) => {
    for (let t = 0; t < ms; t += 50) await frames(Math.min(50, ms - t));
  };
  const isPlain = () =>
    screen.getByTestId('tour-callout').hasAttribute('data-plain');

  // Intro, click, question, observe, wrap-up: anchored and plain steps mixed.
  const mixedSet = (
    mode: GuidedLearningSet['mode'] = 'structured',
    extra: Record<string, unknown> = {}
  ): GuidedLearningSet =>
    ({
      id: 'set-1',
      title: 'Boards tour',
      mode,
      imageUrls: [],
      tourSetup: { widgets: [] },
      steps: [
        {
          id: 'intro',
          label: 'Welcome aboard',
          text: 'This tour shows boards.',
        },
        {
          id: 'a1',
          label: 'Open boards',
          tour: { anchor: 'sidebar.boards', action: 'click' },
        },
        {
          id: 'q',
          label: 'Check in',
          question: { type: 'text', text: 'Which board is yours?' },
        },
        {
          id: 'a2',
          label: 'Dice step',
          tour: { anchor: 'dock.item:dice', action: 'observe' },
        },
        { id: 'wrap', label: 'All done', text: 'That is the tour.' },
      ],
      ...extra,
    }) as unknown as GuidedLearningSet;

  it('shows plain steps as centred cards on the dimmed board, counting every step', async () => {
    await start(mixedSet());
    expect(progress()).toBe('1 / 5');
    expect(isPlain()).toBe(true);
    expect(screen.getByText('Welcome aboard')).toBeInTheDocument();
    expect(screen.getByText('This tour shows boards.')).toBeInTheDocument();
    expect(screen.getByTestId('tour-spotlight')).toBeInTheDocument();
    expect(screen.queryByTestId('tour-spotlight-ring')).not.toBeInTheDocument();
    expect(screen.queryByText(/Couldn't find/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(progress()).toBe('2 / 5');
    expect(isPlain()).toBe(false);
    expect(screen.getByTestId('tour-spotlight-ring')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Boards'));
    await frames();
    expect(progress()).toBe('3 / 5');
    expect(isPlain()).toBe(true);
    expect(screen.getByText('Which board is yours?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(progress()).toBe('4 / 5');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(progress()).toBe('5 / 5');
    expect(isPlain()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });

  it('numbers anchored steps the way Tour Health and the Studio do', async () => {
    const set = mixedSet();
    const health = tourHealthOf(set);
    expect(health.map((x) => x.number)).toEqual([2, 4]);
    await start(set);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(progress()).toBe(`${health[0].number} / ${set.steps.length}`);
    fireEvent.click(screen.getByText('Boards'));
    await frames();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(progress()).toBe(`${health[1].number} / ${set.steps.length}`);
  });

  it('Guided: plain steps move on at reading pace and a click into one does not wait', async () => {
    await start(mixedSet('guided'));
    expect(progress()).toBe('1 / 5');
    expect(screen.getByTestId('tour-auto-status')).toHaveTextContent(
      'Playing each step for you'
    );
    await run(3500);
    expect(progress()).toBe('2 / 5');
    await run(4000);
    expect(progress()).toBe('3 / 5');
    expect(isPlain()).toBe(true);
  });

  it('starts from a chosen step counted among all steps', async () => {
    const set = mixedSet();
    h.loadTour.mockResolvedValue(set);
    render(
      <>
        <Fixture />
        <LiveTourRunner />
      </>
    );
    act(() => requestStartTour({ setId: set.id, fromStep: 3 }));
    await frames();
    expect(progress()).toBe('4 / 5');
    expect(screen.getByText('Dice step')).toBeInTheDocument();
  });

  it('opens with the welcome message before touching the board', async () => {
    await start(
      mixedSet('structured', {
        welcomeEnabled: true,
        welcomeMessage: 'Hi there.\nThis takes a minute.',
        tourSetup: { widgets: ['clock'] },
      })
    );
    const dialog = screen.getByRole('dialog', { name: 'Boards tour' });
    expect(dialog).toHaveTextContent('Hi there.');
    expect(screen.queryByTestId('tour-callout')).not.toBeInTheDocument();
    expect(h.actions.addWidget).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start tour' }));
    await frames();
    expect(h.actions.addWidget).toHaveBeenCalledWith('clock');
    expect(progress()).toBe('1 / 5');
  });

  it('skips the welcome when starting from a later step', async () => {
    const set = mixedSet('structured', {
      welcomeEnabled: true,
      welcomeMessage: 'Hi there.',
    });
    h.loadTour.mockResolvedValue(set);
    render(
      <>
        <Fixture />
        <LiveTourRunner />
      </>
    );
    act(() => requestStartTour({ setId: set.id, fromStep: 1 }));
    await frames();
    expect(progress()).toBe('2 / 5');
  });

  it('closes from the welcome without adding anything', async () => {
    await start(
      mixedSet('structured', {
        welcomeEnabled: true,
        welcomeMessage: 'Hi there.',
        tourSetup: { widgets: ['clock'] },
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
    expect(h.actions.addWidget).not.toHaveBeenCalled();
  });

  it('goes from the welcome to the practice offer on a view-only board', async () => {
    h.board.readOnly = true;
    await start(
      mixedSet('structured', { welcomeEnabled: true, welcomeMessage: 'Hi.' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start tour' }));
    await frames();
    expect(screen.getByText('This board is view-only')).toBeInTheDocument();
  });

  it('skips a blank welcome', async () => {
    await start(
      mixedSet('structured', { welcomeEnabled: true, welcomeMessage: '   ' })
    );
    expect(progress()).toBe('1 / 5');
  });

  it('toasts when no step is anchored', async () => {
    await start(
      mixedSet('structured', { steps: [{ id: 'p', label: 'Only plain' }] })
    );
    expect(h.actions.addToast).toHaveBeenCalledWith(
      "This tour isn't available right now.",
      'error'
    );
  });
});

describe('LiveTourRunner stacking, feedback, reload and access', () => {
  const Dock: React.FC = () => (
    <div data-role="dock" data-testid="dock">
      <button {...tourAttr('dock.open-tools')}>Tools</button>
    </div>
  );
  const mount = () =>
    render(
      <>
        <Dock />
        <Fixture />
        <LiveTourRunner />
      </>
    );
  const launch = async (set: GuidedLearningSet, draft = false) => {
    (draft ? h.loadDraft : h.loadTour).mockResolvedValue(set);
    const view = mount();
    act(() => requestStartTour({ setId: set.id, draft }));
    await frames();
    return view;
  };
  const dim = () => {
    const path = screen.getByTestId('tour-spotlight').querySelector('path');
    if (!path) throw new Error('no dim path');
    return path;
  };
  const saved = () => {
    const raw = sessionStorage.getItem(SAVED_TOUR_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  };
  const stubAnimate = () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
    HTMLElement.prototype.animate = animate;
    return animate;
  };

  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });

  it('dims above the dock and keeps its own layers in order', () => {
    expect(Z_INDEX.tour).toBeGreaterThan(Z_INDEX.dock);
    expect(Z_INDEX.tour).toBeGreaterThan(Z_INDEX.annotationChromeLift);
    expect(Z_INDEX.tour).toBeGreaterThan(Z_INDEX.popover);
    expect(Z_INDEX.tourLift).toBeGreaterThan(Z_INDEX.tour);
    expect(Z_INDEX.tourCallout).toBeGreaterThan(Z_INDEX.tourLift);
    expect(Z_INDEX.tourCursor).toBeGreaterThan(Z_INDEX.tourCallout);
    expect(Z_INDEX.toast).toBeGreaterThan(Z_INDEX.tourCursor);
  });

  it('lifts the dock above the dim only while a step targets it', async () => {
    await launch(
      makeSet([
        { anchor: 'dock.open-tools', action: 'observe' },
        { anchor: 'sidebar.boards', action: 'observe' },
      ])
    );
    const dock = screen.getByTestId('dock');
    expect(dock.style.zIndex).toBe(String(Z_INDEX.tourLift));
    expect(screen.getByTestId('tour-spotlight').style.zIndex).toBe(
      String(Z_INDEX.tour)
    );
    expect(screen.getByTestId('tour-callout').style.zIndex).toBe(
      String(Z_INDEX.tourCallout)
    );
    // The ring draws above the lifted dock.
    const ring = screen.getByTestId('tour-spotlight-ring').closest('svg');
    expect(ring?.style.zIndex).toBe(String(Z_INDEX.tourCallout));

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(progress()).toBe('2 / 2');
    expect(dock.style.zIndex).toBe('');
  });

  it('drops the dock back when the tour ends', async () => {
    await launch(makeSet([{ anchor: 'dock.open-tools', action: 'observe' }]));
    const dock = screen.getByTestId('dock');
    expect(dock.style.zIndex).toBe(String(Z_INDEX.tourLift));
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    expect(dock.style.zIndex).toBe('');
  });

  it('shakes the callout and hints early on a click outside the cutout', async () => {
    const animate = stubAnimate();
    await launch(makeSet([{ anchor: 'sidebar.boards', action: 'click' }]));
    await frames();
    expect(screen.queryByTestId('gl-cursor')).not.toBeInTheDocument();
    fireEvent.click(dim());
    await frames();
    const callout = screen.getByTestId('tour-callout');
    const shakes = animate.mock.calls.filter(
      (_, i) => animate.mock.contexts[i] === callout
    );
    expect(shakes).toHaveLength(1);
    const keyframes = (shakes[0] as unknown[])[0] as Keyframe[];
    expect(keyframes.some((k) => String(k.transform).includes('-8px'))).toBe(
      true
    );
    expect(screen.getByTestId('gl-cursor')).toBeInTheDocument();
  });

  it('flashes instead of shaking under reduced motion', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    const animate = stubAnimate();
    await launch(makeSet([{ anchor: 'sidebar.boards', action: 'observe' }]));
    fireEvent.click(dim());
    const keyframes = (animate.mock.calls[0] as unknown[])[0] as Keyframe[];
    expect(keyframes.every((k) => k.transform === undefined)).toBe(true);
    expect(keyframes.some((k) => k.boxShadow)).toBe(true);
  });

  it('does not shake on a click through the cutout', async () => {
    const animate = stubAnimate();
    await launch(
      makeSet([
        { anchor: 'sidebar.boards', action: 'click' },
        { anchor: 'dock.open-tools', action: 'observe' },
      ])
    );
    fireEvent.click(screen.getByText('Boards'));
    await frames();
    expect(progress()).toBe('2 / 2');
    expect(animate).not.toHaveBeenCalled();
  });

  it('saves the run and offers to resume it after a reload', async () => {
    const set = makeSet(
      [
        { anchor: 'sidebar.boards', action: 'observe' },
        { anchor: 'widget.settings-opener', action: 'observe' },
      ],
      ['dice']
    );
    const first = await launch(set);
    expect(saved()).toEqual({ setId: 'set-1', index: 0, addedIds: ['w1'] });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(saved()).toEqual({ setId: 'set-1', index: 1, addedIds: ['w1'] });

    first.unmount();
    mount();
    expect(screen.getByText('Pick up your tour?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume tour' }));
    await frames();
    expect(progress()).toBe('2 / 2');
    expect(h.actions.addWidget).toHaveBeenCalledTimes(1);

    // The resumed run still knows which widget it added.
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove them' }));
    expect(h.actions.removeWidgets).toHaveBeenCalledWith(['w1']);
    expect(saved()).toBeNull();
  });

  it('resumes a Studio draft run from the draft', async () => {
    h.loadDraft.mockReset();
    const set = makeSet([
      { anchor: 'sidebar.boards', action: 'observe' },
      { anchor: 'dock.open-tools', action: 'observe' },
    ]);
    const first = await launch(set, true);
    expect(saved()).toEqual({
      setId: 'set-1',
      index: 0,
      addedIds: [],
      draft: true,
    });
    first.unmount();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Resume tour' }));
    await frames();
    expect(h.loadDraft).toHaveBeenCalledTimes(2);
    expect(h.loadTour).not.toHaveBeenCalled();
    expect(progress()).toBe('1 / 2');
  });

  it('stops offering the resume when the resumed tour fails to load', async () => {
    const first = await launch(
      makeSet([{ anchor: 'sidebar.boards', action: 'observe' }])
    );
    first.unmount();
    h.loadTour.mockResolvedValue(null);
    const second = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Resume tour' }));
    await frames();
    expect(saved()).toBeNull();
    second.unmount();
    mount();
    expect(screen.queryByText('Pick up your tour?')).not.toBeInTheDocument();
  });

  it('stops offering the resume when the practice board is declined', async () => {
    const first = await launch(
      makeSet([{ anchor: 'sidebar.boards', action: 'observe' }])
    );
    first.unmount();
    h.board.readOnly = true;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Resume tour' }));
    await frames();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
    expect(saved()).toBeNull();
  });

  it('removes the added widgets instead of resuming', async () => {
    const first = await launch(
      makeSet([{ anchor: 'sidebar.boards', action: 'observe' }], ['dice'])
    );
    first.unmount();
    mount();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove added widgets' })
    );
    expect(h.actions.removeWidgets).toHaveBeenCalledWith(['w1']);
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
    expect(saved()).toBeNull();
  });

  it('offers End tour when the run added nothing, and clears it', async () => {
    const first = await launch(
      makeSet([{ anchor: 'sidebar.boards', action: 'observe' }])
    );
    first.unmount();
    mount();
    expect(
      screen.queryByRole('button', { name: 'Remove added widgets' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'End tour' }));
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
    expect(saved()).toBeNull();
  });

  it('clears the saved run when the tour finishes', async () => {
    await launch(makeSet([{ anchor: 'sidebar.boards', action: 'observe' }]));
    expect(saved()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(saved()).toBeNull();
  });

  it('runs without storage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await launch(makeSet([{ anchor: 'sidebar.boards', action: 'observe' }]));
    expect(progress()).toBe('1 / 1');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });

  it('ignores a corrupt saved run', () => {
    sessionStorage.setItem(SAVED_TOUR_KEY, '{"setId":7}');
    mount();
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });

  it('announces each step politely', async () => {
    await launch(
      withSteps(
        makeSet([
          { anchor: 'sidebar.boards', action: 'observe' },
          { anchor: 'dock.open-tools', action: 'click' },
        ]),
        [{ text: 'Your **boards** live here.' }, {}]
      )
    );
    const announcer = screen.getByTestId('tour-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer.textContent).toBe('1 / 2. Step 1. Your boards live here.');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(screen.getByTestId('tour-announcer').textContent).toBe(
      '2 / 2. Step 2'
    );
  });

  it('focuses the step heading on every step, click steps included', async () => {
    await launch(
      makeSet([
        { anchor: 'sidebar.boards', action: 'observe' },
        { anchor: 'dock.open-tools', action: 'click' },
      ])
    );
    expect(document.activeElement).toBe(screen.getByTestId('tour-step-title'));
    const next = screen.getByRole('button', { name: 'Next' });
    fireEvent.click(next);
    next.blur();
    await frames();
    expect(progress()).toBe('2 / 2');
    expect(document.activeElement).toBe(screen.getByTestId('tour-step-title'));
    expect(document.activeElement).toHaveTextContent('Step 2');
  });
});

describe('LiveTourRunner run stats', () => {
  beforeEach(() => {
    h.user = { uid: 'teacher-1' };
  });

  const published = (steps: Binding[]) => ({
    ...makeSet(steps),
    updatedAt: 42,
  });

  it('logs a published run from the snapshot version and marks it done at the end', async () => {
    await start(
      published([
        { anchor: 'sidebar.boards', action: 'observe' },
        { anchor: 'dock.item:dice', action: 'observe' },
      ])
    );
    expect(h.startRunLog).toHaveBeenCalledWith('set-1', 'teacher-1', {
      v: 42,
      furthest: 0,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(h.runLog.update).toHaveBeenCalledWith({ furthest: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(h.runLog.end).toHaveBeenCalledWith({ done: true });
    expect(h.runLog.miss).not.toHaveBeenCalled();
  });

  it('records a missed anchor and the step the teacher left from', async () => {
    await start(
      published([
        { anchor: 'sidebar.classes', action: 'click' },
        { anchor: 'sidebar.boards', action: 'observe' },
      ])
    );
    await frames(ANCHOR_SEARCH_MS + 100);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(h.runLog.miss).toHaveBeenCalledWith('s0');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(h.runLog.end).toHaveBeenCalledWith({ done: false, exit: 1 });
    expect(h.runLog.miss).toHaveBeenCalledTimes(1);
  });

  it('does not count a late anchor as a miss', async () => {
    await start(published([{ anchor: 'sidebar.classes', action: 'observe' }]));
    await frames(ANCHOR_SEARCH_MS + 100);
    const late = document.createElement('button');
    late.setAttribute('data-tour', 'sidebar.classes');
    document.body.appendChild(late);
    await frames(500);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(h.runLog.miss).not.toHaveBeenCalled();
    late.remove();
  });

  it('logs nothing without a signed-in user', async () => {
    h.user = null;
    await start(published([{ anchor: 'sidebar.boards', action: 'observe' }]));
    expect(progress()).toBe('1 / 1');
    expect(h.startRunLog).not.toHaveBeenCalled();
  });

  it('logs nothing for a Studio draft run', async () => {
    h.loadDraft.mockResolvedValue(
      published([{ anchor: 'sidebar.boards', action: 'observe' }])
    );
    render(
      <>
        <Fixture />
        <LiveTourRunner />
      </>
    );
    act(() => {
      requestStartTour({ setId: 'set-1', draft: true });
    });
    await frames();
    expect(progress()).toBe('1 / 1');
    expect(h.startRunLog).not.toHaveBeenCalled();
  });

  it('flushes pending stats when the page hides', async () => {
    await start(published([{ anchor: 'sidebar.boards', action: 'observe' }]));
    window.dispatchEvent(new Event('pagehide'));
    expect(h.runLog.flush).toHaveBeenCalled();
  });
});

describe('LiveTourRunner recorded layouts', () => {
  const place = (xProp: number) => ({
    xProp,
    yProp: 0.1,
    wProp: 0.2,
    hProp: 0.3,
  });
  const layoutSet = (
    steps: (Binding & Record<string, unknown>)[],
    layouts: object[],
    setupWidgets: WidgetType[] = []
  ): GuidedLearningSet =>
    ({
      ...makeSet(steps, setupWidgets),
      tourSetup: { widgets: setupWidgets, layouts },
    }) as unknown as GuidedLearningSet;
  const clockAt = (slot: number, xProp: number) => ({
    slot,
    type: 'clock',
    ...place(xProp),
  });
  const overrideOf = (id: string) => getTourLayoutOverrides().get(id);

  afterEach(() => clearTourLayoutOverrides());

  it('adds a missing slot as an unsaved tour widget at its layout', async () => {
    await start(
      layoutSet(
        [{ anchor: 'sidebar.boards', action: 'observe' }],
        [clockAt(0, 0.4)],
        ['clock']
      )
    );
    expect(h.actions.addWidget).not.toHaveBeenCalled();
    expect(h.actions.addTourWidget).toHaveBeenCalledWith('clock', place(0.4));
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove them' }));
    expect(h.actions.discardTourWidgets).toHaveBeenCalledWith(['t1']);
    expect(h.actions.removeWidgets).not.toHaveBeenCalled();
    expect(h.board.widgets).toEqual([]);
  });

  it('Keep saves the tour widgets', async () => {
    await start(
      layoutSet(
        [{ anchor: 'sidebar.boards', action: 'observe' }],
        [clockAt(0, 0.4)],
        ['clock']
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep them' }));
    expect(h.actions.commitTourWidgets).toHaveBeenCalledWith(['t1']);
    expect(h.actions.discardTourWidgets).not.toHaveBeenCalled();
    expect(h.board.widgets).toEqual([{ id: 't1', type: 'clock' }]);
  });

  it('discards the tour widgets when the runner unmounts mid-tour', async () => {
    h.loadTour.mockResolvedValue(
      layoutSet(
        [{ anchor: 'sidebar.boards', action: 'observe' }],
        [clockAt(0, 0.4)],
        ['clock']
      )
    );
    const view = render(
      <>
        <Fixture />
        <LiveTourRunner />
      </>
    );
    act(() => requestStartTour({ setId: 'set-1' }));
    await frames();
    expect(h.board.widgets.map((w) => w.id)).toEqual(['t1']);
    view.unmount();
    expect(h.actions.discardTourWidgets).toHaveBeenCalledWith(['t1']);
    expect(h.board.widgets).toEqual([]);
    expect(sessionStorage.getItem(SAVED_TOUR_KEY)).toContain('"addedIds":[]');
  });

  it("moves the teacher's widget for the tour without writing it, then puts it back", async () => {
    h.board.widgets = [{ id: 'mine', type: 'clock', z: 1 }];
    await start(
      layoutSet(
        [{ anchor: 'sidebar.boards', action: 'observe' }],
        [clockAt(0, 0.4)],
        ['clock']
      )
    );
    expect(h.actions.addTourWidget).not.toHaveBeenCalled();
    expect(overrideOf('mine')).toEqual(place(0.4));
    expect(h.board.widgets).toEqual([{ id: 'mine', type: 'clock', z: 1 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await frames();
    expect(screen.queryByText("Keep the tour's widgets?")).toBeNull();
    expect(getTourLayoutOverrides().size).toBe(0);
  });

  it('binds each slot to its own widget when the board has two of a type', async () => {
    h.board.widgets = [
      { id: 'front', type: 'clock', z: 5 },
      { id: 'back', type: 'clock', z: 1 },
    ];
    await start(
      layoutSet(
        [{ anchor: 'widget.settings-opener:clock', action: 'click', slot: 1 }],
        [clockAt(0, 0.1), clockAt(1, 0.6)],
        ['clock']
      )
    );
    expect(overrideOf('back')?.xProp).toBe(0.1);
    expect(overrideOf('front')?.xProp).toBe(0.6);
    fireEvent.click(screen.getByText('Settings back'));
    await frames();
    expect(screen.getByTestId('tour-callout')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Settings front'));
    await frames();
    expect(screen.queryByTestId('tour-callout')).toBeNull();
  });

  it('applies keyframes when their step starts, and undoes them going back', async () => {
    h.board.widgets = [{ id: 'mine', type: 'clock', z: 1 }];
    await start(
      layoutSet(
        [
          { anchor: 'sidebar.boards', action: 'observe' },
          {
            anchor: 'sidebar.boards',
            action: 'observe',
            layoutKeyframes: [{ slot: 0, ...place(0.8) }],
          },
        ],
        [clockAt(0, 0.4)],
        ['clock']
      )
    );
    expect(overrideOf('mine')?.xProp).toBe(0.4);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await frames();
    expect(overrideOf('mine')?.xProp).toBe(0.8);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await frames();
    expect(overrideOf('mine')?.xProp).toBe(0.4);
  });

  it('moves a widget the step opens to its recorded layout', async () => {
    await start(
      layoutSet(
        [
          {
            anchor: 'dock.item:dice',
            action: 'click',
            spawns: { slot: 1, type: 'dice', ...place(0.7) },
          },
          { anchor: 'sidebar.boards', action: 'observe' },
        ],
        [clockAt(0, 0.4)]
      )
    );
    act(() => h.actions.addWidget('dice'));
    await frames();
    expect(overrideOf('w1')).toEqual(place(0.7));
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    await frames();
    expect(getTourLayoutOverrides().size).toBe(0);
    expect(h.board.widgets.map((w) => w.id)).toEqual(['w1']);
  });
});

describe('LiveTourRunner robustness', () => {
  const layoutSet = (
    steps: Binding[],
    layouts: object[],
    setupWidgets: WidgetType[] = []
  ): GuidedLearningSet =>
    ({
      ...makeSet(steps, setupWidgets),
      tourSetup: { widgets: setupWidgets, layouts },
    }) as unknown as GuidedLearningSet;
  const clockAt = (slot: number) => ({
    slot,
    type: 'clock',
    xProp: 0.4,
    yProp: 0.1,
    wProp: 0.2,
    hProp: 0.3,
  });
  const emit = () =>
    act(() => {
      h.board.version++;
      h.board.listeners.forEach((l) => l());
    });
  const reduceMotion = () =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );

  // A board whose toolbar shows only while selected and whose minimized widgets are faded out.
  const LiveWidget: React.FC<{ w: (typeof h.board.widgets)[number] }> = ({
    w,
  }) => {
    const patch = useTourWidgetPatch(w.id);
    const hidden = w.minimized && !patch?.restored;
    return (
      <div
        {...tourAttr('widget.window', w.id, w.type)}
        style={{ opacity: hidden ? 0 : 1 }}
      >
        {h.board.selectedWidgetId === w.id && (
          <button {...tourAttr('widget.close', w.id, w.type)}>
            Close {w.id}
          </button>
        )}
      </div>
    );
  };
  const LiveBoard: React.FC = () => {
    useSyncExternalStore(
      (l) => {
        h.board.listeners.add(l);
        return () => h.board.listeners.delete(l);
      },
      () => h.board.version
    );
    return (
      <>
        {h.board.widgets.map((w) => (
          <LiveWidget key={w.id} w={w} />
        ))}
      </>
    );
  };
  const LiveDock: React.FC = () => {
    const [open, setOpen] = React.useState(false);
    React.useEffect(() => {
      const on = (e: Event) =>
        setOpen((e as CustomEvent<TourDockRequest>).detail.expanded);
      window.addEventListener(TOUR_DOCK_EVENT, on);
      return () => window.removeEventListener(TOUR_DOCK_EVENT, on);
    }, []);
    return (
      <div data-role="dock" data-dock-expanded={open ? 'true' : 'false'}>
        <div style={{ opacity: open ? 1 : 0 }}>
          <button {...tourTypeAttr('dock.item', 'dice')}>Dice</button>
        </div>
      </div>
    );
  };
  const startOn = async (
    set: GuidedLearningSet,
    board: React.ReactNode,
    beforeStart?: () => void
  ) => {
    h.loadTour.mockResolvedValue(set);
    render(
      <>
        {board}
        <LiveTourRunner />
      </>
    );
    beforeStart?.();
    act(() => requestStartTour({ setId: set.id }));
    await frames();
  };
  const found = () => screen.queryByTestId('tour-spotlight-ring') !== null;
  const dockState = () =>
    document
      .querySelector('[data-role="dock"]')
      ?.getAttribute('data-dock-expanded');

  afterEach(() => {
    clearTourLayoutOverrides();
    clearTourWidgetPatches();
  });

  it('opens a collapsed dock for a dock step and closes it again at the end', async () => {
    await startOn(
      makeSet([{ anchor: 'dock.item:dice', action: 'observe' }]),
      <LiveDock />
    );
    await frames(500);
    expect(dockState()).toBe('true');
    expect(found()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await frames();
    expect(dockState()).toBe('false');
  });

  it('selects the widget for a toolbar step and clears the selection at the end', async () => {
    h.board.widgets = [{ id: 'mine', type: 'clock' }];
    await startOn(
      makeSet([{ anchor: 'widget.close:clock', action: 'observe' }]),
      <LiveBoard />
    );
    await frames(500);
    expect(h.actions.setSelectedWidgetId).toHaveBeenCalledWith('mine');
    expect(found()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await frames();
    expect(h.actions.setSelectedWidgetId).toHaveBeenLastCalledWith(null);
  });

  it('leaves a selection the teacher changed alone', async () => {
    h.board.widgets = [
      { id: 'mine', type: 'clock' },
      { id: 'other', type: 'dice' },
    ];
    await startOn(
      makeSet([{ anchor: 'widget.close:clock', action: 'observe' }]),
      <LiveBoard />
    );
    await frames(500);
    act(() => h.actions.setSelectedWidgetId('other'));
    await frames();
    h.actions.setSelectedWidgetId.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    await frames();
    expect(h.actions.setSelectedWidgetId).not.toHaveBeenCalledWith(null);
  });

  it('shows a minimized widget for the step without saving it, and minimizes it again at the end', async () => {
    h.board.widgets = [{ id: 'mine', type: 'clock', minimized: true }];
    await startOn(
      makeSet([{ anchor: 'widget.window:clock', action: 'observe' }]),
      <LiveBoard />
    );
    await frames(500);
    expect(getTourWidgetPatches().get('mine')?.restored).toBe(true);
    expect(found()).toBe(true);
    expect(h.board.widgets[0].minimized).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await frames();
    expect(getTourWidgetPatches().size).toBe(0);
  });

  it('scrolls an off-screen anchor into view before spotlighting it', async () => {
    let x = 5000;
    const scrolled = vi.fn(() => {
      x = 10;
      window.dispatchEvent(new Event('scroll'));
    });
    await startOn(
      makeSet([{ anchor: 'library.item:dice', action: 'observe' }]),
      <button {...tourTypeAttr('library.item', 'dice')}>Dice tile</button>,
      () => {
        const tile = screen.getByText('Dice tile');
        Object.defineProperty(tile, 'getBoundingClientRect', {
          value: () => new DOMRect(x, 10, 40, 40),
        });
        tile.scrollIntoView = scrolled;
      }
    );
    await frames(800);
    expect(scrolled).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
    });
    expect(found()).toBe(true);
  });

  it('raises the step widget above the others for now', async () => {
    h.board.widgets = [
      { id: 'top', type: 'clock', z: 5 },
      { id: 'mine', type: 'dice', z: 1 },
    ];
    await start(
      makeSet([{ anchor: 'widget.settings-opener:dice', action: 'observe' }])
    );
    await frames();
    expect(getTourWidgetPatches().get('mine')?.z).toBe(6);
    expect(h.board.widgets.find((w) => w.id === 'mine')?.z).toBe(1);
  });

  it('ends the tour on a board switch, discarding only its own widgets and asking nothing', async () => {
    await start(
      layoutSet(
        [{ anchor: 'sidebar.boards', action: 'observe' }],
        [clockAt(0)],
        ['clock']
      )
    );
    expect(h.board.widgets.map((w) => w.id)).toEqual(['t1']);
    h.board.id = 'board-2';
    h.board.widgets = [
      { id: 'teacher', type: 'clock' },
      { id: 't1', type: 'clock', transient: true },
    ];
    emit();
    await frames();
    expect(screen.queryByTestId('tour-callout')).not.toBeInTheDocument();
    expect(
      screen.queryByText("Keep the tour's widgets?")
    ).not.toBeInTheDocument();
    expect(h.actions.discardTourWidgets).toHaveBeenCalledWith(['t1']);
    expect(h.actions.removeWidgets).not.toHaveBeenCalled();
    expect(h.board.widgets.map((w) => w.id)).toEqual(['teacher']);
  });

  it('Esc on the keep-or-remove prompt keeps the widgets', async () => {
    await start(
      layoutSet(
        [{ anchor: 'sidebar.boards', action: 'observe' }],
        [clockAt(0)],
        ['clock']
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    await frames();
    const keep = screen.getByRole('button', { name: 'Keep them' });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(keep, { key: 'Escape' });
    await frames();
    expect(h.actions.commitTourWidgets).toHaveBeenCalledWith(['t1']);
    expect(h.actions.discardTourWidgets).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('traps Tab inside the prompt', async () => {
    await start(
      layoutSet(
        [{ anchor: 'sidebar.boards', action: 'observe' }],
        [clockAt(0)],
        ['clock']
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exit tour' }));
    await frames();
    const remove = screen.getByRole('button', { name: 'Remove them' });
    const keep = screen.getByRole('button', { name: 'Keep them' });
    fireEvent.keyDown(keep, { key: 'Tab' });
    expect(document.activeElement).toBe(remove);
    fireEvent.keyDown(remove, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(keep);
  });

  it('Esc on the practice-board offer cancels without making a board', async () => {
    h.board.readOnly = true;
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'observe' }]));
    const practice = screen.getByRole('button', {
      name: 'Start on a practice board',
    });
    expect(document.activeElement).toBe(practice);
    fireEvent.keyDown(practice, { key: 'Escape' });
    await frames();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(h.actions.createNewDashboard).not.toHaveBeenCalled();
  });

  it('re-places the callout when the window resizes', async () => {
    const set = withSteps(
      makeSet([
        { anchor: 'sidebar.boards', action: 'observe' },
        { anchor: 'sidebar.boards', action: 'observe' },
      ]),
      [{ tour: undefined }]
    );
    await start(set);
    const callout = screen.getByTestId('tour-callout');
    expect(callout.style.left).toBe(`${(window.innerWidth - 400) / 2}px`);
    vi.stubGlobal('innerWidth', 700);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await frames();
    expect(callout.style.left).toBe(`${(700 - 400) / 2}px`);
  });

  it('keeps the callout off the dock and FABs', async () => {
    await startOn(
      makeSet([{ anchor: 'sidebar.boards', action: 'observe' }]),
      <>
        <Fixture />
        <div data-tour-obstacle="" data-testid="obstacle" />
      </>,
      () => {
        Object.defineProperty(
          screen.getByTestId('obstacle'),
          'getBoundingClientRect',
          { value: () => new DOMRect(0, 60, 1024, 300) }
        );
      }
    );
    await frames();
    const callout = screen.getByTestId('tour-callout');
    expect(callout.style.top).not.toBe('66px');
    expect(callout.style.left).toBe('66px');
  });

  it('places the callout below the target with nothing in the way', async () => {
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'observe' }]));
    expect(screen.getByTestId('tour-callout').style.top).toBe('66px');
  });

  it('skips the autopilot glide under reduced motion but still clicks', async () => {
    reduceMotion();
    await start(
      makeSet(
        [
          { anchor: 'sidebar.boards', action: 'click' },
          { anchor: 'dock.item:dice', action: 'observe' },
        ],
        [],
        'guided'
      )
    );
    const clicks = vi.fn();
    screen.getByText('Boards').addEventListener('click', clicks);
    for (let i = 0; i < 80 && clicks.mock.calls.length === 0; i++) {
      await frames(50);
      expect(screen.queryByTestId('gl-cursor')).not.toBeInTheDocument();
    }
    expect(clicks).toHaveBeenCalled();
  });

  it('shows a still hint instead of the cursor glide under reduced motion', async () => {
    reduceMotion();
    await start(makeSet([{ anchor: 'sidebar.boards', action: 'click' }]));
    await frames();
    await frames(TRY_HINT_MS + 100);
    expect(screen.queryByTestId('gl-cursor')).not.toBeInTheDocument();
    expect(screen.getByTestId('tour-static-hint')).toHaveTextContent(
      'Your turn: click the highlighted spot'
    );
  });
});

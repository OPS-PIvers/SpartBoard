import React, { useSyncExternalStore } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourAttr, tourTypeAttr } from '@/config/tourAnchors';
import type { GuidedLearningSet } from '@/types';
import { LiveTourRunner } from '../LiveTourRunner';
import {
  clearTourEdit,
  getTourEdit,
  getTourEditPlayback,
  selectTourEditStep,
  setTourEdit,
  setTourEditRecording,
} from './tourEditStore';

const h = vi.hoisted(() => {
  type Widget = { id: string; type: string; transient?: boolean };
  const board = {
    id: 'board-1',
    widgets: [] as Widget[],
    version: 0,
    listeners: new Set<() => void>(),
  };
  const emit = () => {
    board.version++;
    board.listeners.forEach((l) => l());
  };
  let n = 0;
  const actions = {
    addWidget: vi.fn(),
    setTourTransientSpawns: vi.fn(),
    removeWidgets: vi.fn(),
    addTourWidget: vi.fn((type: string) => {
      const id = `t${++n}`;
      board.widgets = [...board.widgets, { id, type, transient: true }];
      emit();
      return id;
    }),
    commitTourWidgets: vi.fn(),
    discardTourWidgets: vi.fn((ids: readonly string[]) => {
      board.widgets = board.widgets.filter(
        (w) => !(w.transient && ids.includes(w.id))
      );
      emit();
    }),
    updateWidget: vi.fn(),
    addToast: vi.fn(),
    setSelectedWidgetId: vi.fn(),
    createNewDashboard: vi.fn(),
  };
  return { board, actions, emit };
});

vi.mock('@/components/sparty/useShowSparty', () => ({
  useShowSparty: () => false,
}));
vi.mock('../tourRuns', () => ({ startTourRunLog: vi.fn() }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => true,
    user: { uid: 'admin' },
    featurePermissions: [],
  }),
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
      isActiveBoardReadOnly: false,
      selectedWidgetId: null,
      activeDashboard: { id: h.board.id, widgets: h.board.widgets },
    };
  },
}));
vi.mock('@/hooks/useGuidedLearning', () => ({ loadBuildingSet: vi.fn() }));
vi.mock('../publishedTours', () => ({ loadRunnableTour: vi.fn() }));

type Binding = {
  anchor: string;
  action: 'click' | 'observe';
  teacherMustClick?: boolean;
};

const makeSet = (steps: Binding[]): GuidedLearningSet =>
  ({
    id: 'set-1',
    title: 'Tour',
    mode: 'tour',
    imageUrls: [],
    steps: steps.map((tour, i) => ({
      id: `s${i}`,
      label: `Step ${i + 1}`,
      tour,
    })),
    tourSetup: { widgets: [], useTeacherBoard: true, autopilot: true },
  }) as unknown as GuidedLearningSet;

const clicks = { boards: vi.fn(), dice: vi.fn(), menu: vi.fn() };

const Fixture: React.FC = () => (
  <div>
    <button {...tourAttr('sidebar.boards')} onClick={clicks.boards}>
      Boards
    </button>
    <button {...tourTypeAttr('dock.item', 'dice')} onClick={clicks.dice}>
      Dice
    </button>
    <button {...tourAttr('sidebar.backgrounds')} onClick={clicks.menu}>
      Menu
    </button>
  </div>
);

const frames = async (ms = 50) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const run = async (ms: number) => {
  for (let t = 0; t < ms; t += 50) await frames(50);
};

const edit = async (set: GuidedLearningSet, selected = 0) => {
  render(
    <>
      <Fixture />
      <LiveTourRunner />
    </>
  );
  act(() => setTourEdit({ set, selected, replay: 0, readAloud: false }));
  await frames();
};

const STEPS: Binding[] = [
  { anchor: 'sidebar.boards', action: 'click' },
  { anchor: 'dock.item:dice', action: 'click' },
  { anchor: 'sidebar.backgrounds', action: 'observe' },
];

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(10, 10, 40, 40)
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers();
  h.board.widgets = [];
  Object.values(h.actions).forEach((fn) => fn.mockClear());
  Object.values(clicks).forEach((fn) => fn.mockClear());
});

afterEach(() => {
  act(() => clearTourEdit());
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

describe('LiveTourRunner edit mode', () => {
  it('plays the selected step without the tour bar or Autopilot', async () => {
    await edit(makeSet(STEPS));
    await run(500);
    expect(screen.queryByTestId('tour-bar')).not.toBeInTheDocument();
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    await run(4000);
    expect(clicks.boards).not.toHaveBeenCalled();
    expect(getTourEditPlayback().index).toBe(0);
  });

  it('fast-forwards through earlier steps to the selection', async () => {
    await edit(makeSet(STEPS));
    await run(300);
    act(() => selectTourEditStep(2));
    await run(3000);
    expect(clicks.boards).toHaveBeenCalledTimes(1);
    expect(clicks.dice).toHaveBeenCalledTimes(1);
    expect(clicks.menu).not.toHaveBeenCalled();
    expect(getTourEditPlayback()).toMatchObject({ index: 2, jumping: false });
    expect(screen.getByText('Step 3')).toBeInTheDocument();
    expect(getTourEdit()?.selected).toBe(2);
  });

  it('opens straight at a later step by replaying the ones before it', async () => {
    await edit(makeSet(STEPS), 1);
    await run(3000);
    expect(clicks.boards).toHaveBeenCalledTimes(1);
    expect(clicks.dice).not.toHaveBeenCalled();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
  });

  it('stops on a step the admin must click, then carries on after the click', async () => {
    await edit(
      makeSet([
        { anchor: 'sidebar.boards', action: 'click', teacherMustClick: true },
        ...STEPS.slice(1),
      ])
    );
    await run(300);
    act(() => selectTourEditStep(2));
    await run(2000);
    expect(screen.getByText('You click this one')).toBeInTheDocument();
    expect(getTourEditPlayback()).toMatchObject({ index: 0, blocked: true });
    fireEvent.click(screen.getByText('Boards'));
    await run(3000);
    expect(clicks.dice).toHaveBeenCalledTimes(1);
    expect(getTourEditPlayback().index).toBe(2);
  });

  it('follows a real click on the selected step to the next one', async () => {
    await edit(makeSet(STEPS));
    await run(300);
    fireEvent.click(screen.getByText('Boards'));
    await run(300);
    expect(getTourEdit()?.selected).toBe(1);
    expect(screen.getByText('Step 2')).toBeInTheDocument();
  });

  it('stands aside while Record from here captures real clicks', async () => {
    await edit(makeSet(STEPS));
    await run(300);
    act(() => setTourEditRecording(true));
    await run(100);
    expect(screen.queryByText('Step 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Boards'));
    await run(300);
    expect(getTourEdit()?.selected).toBe(0);
    act(() => setTourEditRecording(false));
    await run(100);
    expect(screen.getByText('Step 1')).toBeInTheDocument();
  });

  it('replays from step 1 when an earlier step is selected', async () => {
    await edit(makeSet(STEPS), 2);
    await run(3000);
    expect(clicks.boards).toHaveBeenCalledTimes(1);
    act(() => selectTourEditStep(1));
    await run(3000);
    expect(clicks.boards).toHaveBeenCalledTimes(2);
    expect(clicks.dice).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Step 2')).toBeInTheDocument();
  });

  it('shows edited step text without replaying', async () => {
    const set = makeSet(STEPS);
    await edit(set);
    await run(300);
    act(() => {
      const cur = getTourEdit();
      if (!cur) return;
      setTourEdit({
        ...cur,
        set: {
          ...set,
          steps: set.steps.map((s, i) =>
            i === 0 ? { ...s, label: 'Renamed' } : s
          ),
        },
      });
    });
    await run(100);
    expect(screen.getByText('Renamed')).toBeInTheDocument();
  });

  it('tears the stage down when the editor closes', async () => {
    await edit(makeSet(STEPS));
    await run(300);
    act(() => clearTourEdit());
    await run(100);
    expect(screen.queryByText('Step 1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-tour')).not.toBeInTheDocument();
  });
});

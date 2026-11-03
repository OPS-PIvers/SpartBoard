import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, render, screen, fireEvent } from '@testing-library/react';
import type { RandomConfig, WidgetData } from '@/types';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useDashboard } from '@/context/useDashboard';
import { connectionsUi } from '@/context/connectionsUiStore';
import {
  followDrawPatch,
  renamesById,
  useNamesFromStations,
} from './useNamesFromStations';
import { RandomNamesFromStationsField } from './settingsFields';
import randomSchema from './settings.schema';

vi.mock('@/context/useDashboard');
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: { number?: number }) =>
      key.endsWith('stationNumber') ? `Station ${o?.number}` : key,
  }),
}));

const updateWidget = vi.fn();

const stations = {
  id: 's1',
  type: 'stations',
  config: {
    stations: [
      { id: 'b', title: 'Reading', order: 1 },
      { id: 'a', title: '  ', order: 0 },
    ],
  },
} as unknown as WidgetData;

const random = (config: Partial<RandomConfig> = {}): WidgetData =>
  ({
    id: 'r1',
    type: 'random',
    config: { rosterMode: 'class', firstNames: '', ...config },
  }) as unknown as WidgetData;

const follow = { id: 'f1', kind: 'follow', leaderId: 's1', followerId: 'r1' };

const mockBoard = (
  widgets: WidgetData[],
  connections: unknown[] = [follow],
  extra: Record<string, unknown> = {}
) =>
  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    activeDashboard: { id: 'board-1', widgets, connections },
    updateWidget,
    isActiveBoardReadOnly: false,
    ...extra,
  });

describe('useNamesFromStations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes the station names, in order, into a following Randomizer', () => {
    const r = random({ firstNames: 'Ann\nBo', lastNames: 'X' });
    mockBoard([stations, r]);
    renderHook(() => useNamesFromStations(r, true));
    expect(updateWidget).toHaveBeenCalledWith(
      'r1',
      {
        config: expect.objectContaining({
          firstNames: 'Station 1\nReading',
          lastNames: '',
          rosterMode: 'custom',
          lastResult: null,
        }) as unknown,
      },
      { skipHistory: true }
    );
  });

  it('waits for the names to come back from Drive before writing on a reloaded board', () => {
    vi.useFakeTimers();
    try {
      const scrubbed = {
        ...random({ rosterMode: 'custom' }),
        config: { rosterMode: 'custom', mode: 'shuffle' },
      } as unknown as WidgetData;
      mockBoard([stations, scrubbed]);
      const { rerender } = renderHook(
        ({ w }) => useNamesFromStations(w, true),
        { initialProps: { w: scrubbed } }
      );
      vi.advanceTimersByTime(1000);
      expect(updateWidget).not.toHaveBeenCalled();
      const restored = random({
        rosterMode: 'custom',
        firstNames: 'Station 1\nReading',
        lastResult: ['Reading', 'Station 1'],
      });
      mockBoard([stations, restored]);
      rerender({ w: restored });
      vi.advanceTimersByTime(10000);
      expect(updateWidget).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes the station names after the wait when Drive has none', () => {
    vi.useFakeTimers();
    try {
      const scrubbed = {
        ...random(),
        config: { rosterMode: 'custom' },
      } as unknown as WidgetData;
      mockBoard([stations, scrubbed]);
      renderHook(() => useNamesFromStations(scrubbed, true));
      vi.advanceTimersByTime(5000);
      expect(updateWidget).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the names when the Stations widget has no stations', () => {
    const r = random({ firstNames: 'Ann', rosterMode: 'custom' });
    const empty = { ...stations, config: { stations: [] } } as WidgetData;
    mockBoard([empty, r]);
    renderHook(() => useNamesFromStations(r, true));
    expect(updateWidget).toHaveBeenCalledWith(
      'r1',
      { config: expect.objectContaining({ firstNames: '' }) as unknown },
      { skipHistory: true }
    );
  });

  it('keeps the draw when a station it already follows is renamed', () => {
    const r = random({
      firstNames: 'Station 1\nReading',
      rosterMode: 'custom',
      mode: 'shuffle',
      lastResult: ['Reading', 'Station 1'],
      doneNames: ['Reading'],
    });
    mockBoard([stations, r]);
    const { rerender } = renderHook(({ w }) => useNamesFromStations(w, true), {
      initialProps: { w: r },
    });
    expect(updateWidget).not.toHaveBeenCalled();
    const renamed = {
      ...stations,
      config: {
        stations: [
          { id: 'a', title: 'Art', order: 0 },
          { id: 'b', title: 'Reading Corner', order: 1 },
        ],
      },
    } as unknown as WidgetData;
    mockBoard([renamed, r]);
    rerender({ w: r });
    expect(updateWidget).toHaveBeenCalledWith(
      'r1',
      {
        config: expect.objectContaining({
          firstNames: 'Art\nReading Corner',
          lastResult: ['Reading Corner', 'Art'],
          doneNames: ['Reading Corner'],
        }) as unknown,
      },
      { skipHistory: true }
    );
  });

  it('does nothing once the names already match', () => {
    const r = random({
      firstNames: 'Station 1\nReading',
      lastNames: '',
      rosterMode: 'custom',
    });
    mockBoard([stations, r]);
    renderHook(() => useNamesFromStations(r, true));
    expect(updateWidget).not.toHaveBeenCalled();
  });

  it('does nothing with Connections off, without a Follow, or read-only', () => {
    const r = random();
    mockBoard([stations, r]);
    renderHook(() => useNamesFromStations(r, false));
    mockBoard([stations, r], []);
    renderHook(() => useNamesFromStations(r, true));
    mockBoard([stations, r], [follow], { isActiveBoardReadOnly: true });
    renderHook(() => useNamesFromStations(r, true));
    expect(updateWidget).not.toHaveBeenCalled();
  });
});

describe('renamesById', () => {
  it('leaves a name two stations share alone', () => {
    const prev = new Map([
      ['a', 'Art'],
      ['b', 'Art'],
      ['c', 'Math'],
    ]);
    const current = new Map([
      ['a', 'Art'],
      ['b', 'Art S'],
      ['c', 'Music'],
    ]);
    expect([...renamesById(prev, current)]).toEqual([['Math', 'Music']]);
  });
});

describe('followDrawPatch', () => {
  const base = (c: Partial<RandomConfig>) =>
    ({ firstNames: 'A\nB\nC', lastNames: '', ...c }) as RandomConfig;

  const none = new Map<string, string>();
  it('drops a removed station and adds a new one at the end of the shuffle', () => {
    expect(
      followDrawPatch(
        base({ lastResult: ['C', 'A', 'B'], lockedNames: ['B'] }),
        none,
        ['A', 'C', 'D', 'E']
      )
    ).toEqual({ lastResult: ['C', 'A', 'D', 'E'], lockedNames: [] });
  });

  const xyz = new Map([
    ['A', 'X'],
    ['B', 'Y'],
    ['C', 'Z'],
  ]);
  it('renames names inside groups and a single pick', () => {
    expect(
      followDrawPatch(
        base({ lastResult: [{ names: ['A', 'C'] }, { names: ['B'] }] }),
        xyz,
        ['X', 'Y', 'Z']
      ).lastResult
    ).toEqual([{ names: ['X', 'Z'] }, { names: ['Y'] }]);
    expect(
      followDrawPatch(base({ lastResult: 'B' }), xyz, ['X', 'Y', 'Z'])
        .lastResult
    ).toBe('Y');
    expect(
      followDrawPatch(base({ lastResult: 'B' }), none, ['A', 'C']).lastResult
    ).toBeNull();
  });

  it('leaves a reordered list alone and adds a new station to the names left to pick', () => {
    expect(
      followDrawPatch(
        base({ lastResult: 'A', remainingStudents: ['B', 'C'] }),
        new Map([
          ['A', 'A'],
          ['B', 'B'],
          ['C', 'C'],
        ]),
        ['C', 'B', 'A', 'D']
      )
    ).toEqual({ lastResult: 'A', remainingStudents: ['B', 'C', 'D'] });
  });
});

describe('Randomizer settings while following Stations', () => {
  const ctxFor = (followLeader: WidgetData | null): CustomRenderCtx => ({
    config: { rosterMode: 'custom' },
    widget: random(),
    isAdmin: false,
    canAccessFeature: () => true,
    followLeader,
    t: (key: string, o?: Record<string, unknown>) =>
      typeof o?.title === 'string' ? `${key}:${o.title}` : key,
    updateConfig: vi.fn(),
    id: 'field',
    labelId: 'field-label',
  });

  const visibleKeys = (followLeader: WidgetData | null) =>
    randomSchema.groups
      .find((g) => g.id === 'content')
      ?.fields.filter(
        (f) => !f.visibleWhen || f.visibleWhen(ctxFor(followLeader))
      )
      .map((f) => `${f.key}:${f.type}`);

  it('swaps the name source fields for the connected row', () => {
    expect(visibleKeys(stations)).toEqual(['rosterMode:custom']);
    expect(visibleKeys(null)).toEqual([
      'rosterMode:rosterPicker',
      'firstNames:textarea',
      'lastNames:textarea',
      'remainingStudents:custom',
    ]);
  });

  it('names the Stations widget and opens its connection', () => {
    mockBoard([stations, random()]);
    render(<RandomNamesFromStationsField ctx={ctxFor(stations)} />);
    expect(
      screen.getByText(/widgetSettings\.random\.namesFromStations:/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(connectionsUi.get().editor).toEqual({
      boardId: 'board-1',
      connections: [follow],
      replaces: ['f1'],
    });
  });

  it('renders nothing when not following', () => {
    mockBoard([stations, random()], []);
    const { container } = render(
      <RandomNamesFromStationsField ctx={ctxFor(null)} />
    );
    expect(container.firstChild).toBeNull();
  });
});

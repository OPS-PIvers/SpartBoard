import { describe, expect, it } from 'vitest';
import type { Dashboard, SequenceConnection, WidgetData } from '@/types';
import { advanceRun, joinRunByHand } from './connectionEngine';
import {
  convertLegacyConnections,
  LEGACY_CONNECTIONS_MARKER,
} from './legacyConnections';

const w = (
  id: string,
  type: WidgetData['type'],
  config: Record<string, unknown> = {}
): WidgetData => ({
  id,
  type,
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  z: 1,
  flipped: false,
  config,
});

const board = (widgets: WidgetData[], extra: Partial<Dashboard> = {}) => ({
  id: 'b',
  name: 'B',
  background: '',
  createdAt: 0,
  widgets,
  ...extra,
});

const seqs = (r: ReturnType<typeof convertLegacyConnections>) =>
  (r?.connections ?? []).filter(
    (c): c is SequenceConnection => c.kind === 'sequence'
  );

describe('convertLegacyConnections', () => {
  it('returns null when nothing uses the old toggles', () => {
    expect(convertLegacyConnections(board([w('t', 'time-tool')]))).toBeNull();
  });

  it('turns Timer end actions into one start-then-act Sequence', () => {
    const r = convertLegacyConnections(
      board([
        w('t', 'time-tool', {
          duration: 60,
          timerEndTrafficColor: 'red',
          timerEndVoiceLevel: 0,
          timerEndTriggerStationsRotate: true,
        }),
        w('l', 'traffic'),
        w('e', 'expectations'),
        w('s', 'stations'),
      ])
    );
    const [seq] = seqs(r);
    expect(seq.repeat).toBe('once');
    expect(seq.steps.map((s) => s.actions)).toEqual([
      [{ widgetId: 't', action: 'start' }],
      [
        { widgetId: 'e', action: 'voice-0' },
        { widgetId: 'l', action: 'red' },
        { widgetId: 's', action: 'rotate' },
      ],
    ]);
    expect(r?.markers).toEqual({ t: { [LEGACY_CONNECTIONS_MARKER]: true } });
  });

  it('makes Timer and a Randomizer that start each other one repeating loop', () => {
    const r = convertLegacyConnections(
      board([
        w('t', 'time-tool', { duration: 60, timerEndTriggerRandom: true }),
        w('r', 'random', { mode: 'single', autoStartTimer: true }),
      ])
    );
    expect(seqs(r)).toHaveLength(1);
    expect(seqs(r)[0].repeat).toBe('until-done');
    expect(Object.keys(r?.markers ?? {}).sort()).toEqual(['r', 't']);
  });

  it('turns Randomizer auto-start into pick-then-restart', () => {
    const r = convertLegacyConnections(
      board([
        w('t', 'time-tool'),
        w('r', 'random', { mode: 'single', autoStartTimer: true }),
      ])
    );
    expect(seqs(r)[0].steps.map((s) => s.actions[0])).toEqual([
      { widgetId: 'r', action: 'next' },
      { widgetId: 't', action: 'restart' },
    ]);
  });

  it('turns the syncs into Follows', () => {
    const r = convertLegacyConnections(
      board([
        w('snd', 'sound', { autoTrafficLight: true, syncExpectations: true }),
        w('l', 'traffic'),
        w('e', 'expectations'),
        w('t', 'time-tool'),
        w('m', 'music', { syncWithTimeTool: true }),
        w('txt', 'text'),
        w('q', 'qr', { syncWithTextWidget: true }),
        w('wx', 'weather'),
        w('g', 'recessGear', { linkedWeatherWidgetId: 'wx' }),
      ])
    );
    const follows = (r?.connections ?? []).map((c) =>
      c.kind === 'follow' ? `${c.leaderId}>${c.followerId}` : ''
    );
    expect(follows.sort()).toEqual(
      ['snd>l', 'e>snd', 't>m', 'txt>q', 'wx>g'].sort()
    );
  });

  it('skips marked widgets and waits for a missing partner', () => {
    expect(
      convertLegacyConnections(
        board([
          w('q', 'qr', {
            syncWithTextWidget: true,
            [LEGACY_CONNECTIONS_MARKER]: true,
          }),
          w('txt', 'text'),
        ])
      )
    ).toBeNull();
    expect(
      convertLegacyConnections(
        board([w('q', 'qr', { syncWithTextWidget: true })])
      )
    ).toBeNull();
  });

  it('runs a converted Timer end action each time the teacher starts the timer', () => {
    const now = 1_000_000;
    const widgets = [
      w('t', 'time-tool', {
        mode: 'timer',
        duration: 5,
        elapsedTime: 5,
        isRunning: true,
        startTime: now,
        timerEndTrafficColor: 'red',
      }),
      w('l', 'traffic', { active: 'green' }),
    ];
    const [seq] = seqs(convertLegacyConnections(board(widgets)));
    const joined = joinRunByHand(seq, widgets, 't', 'start', now, 'd');
    expect(joined?.sequence.run?.stepIndex).toBe(0);
    if (!joined) return;
    const atEnd = advanceRun(joined.sequence, widgets, now + 5000, 'd');
    expect(atEnd.patches.l).toEqual({ active: 'red' });
    const done = advanceRun(atEnd.sequence, widgets, now + 5300, 'd');
    expect(done.finished).toBe(true);
  });
});

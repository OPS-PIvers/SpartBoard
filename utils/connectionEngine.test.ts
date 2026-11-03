import { describe, expect, it } from 'vitest';
import type { SequenceConnection, WidgetData } from '@/types';
import {
  advanceRun,
  draftFromPicks,
  followingScoreboard,
  isStepFinished,
  joinRunByHand,
  liveConnections,
} from './connectionEngine';
import { currentShuffleName } from './randomCurrentName';

const widget = (
  id: string,
  type: WidgetData['type'],
  config: Record<string, unknown>
): WidgetData => ({
  id,
  type,
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  z: 1,
  flipped: false,
  config,
});

const timer = (id: string, seconds: number, extra = {}) =>
  widget(id, 'time-tool', {
    mode: 'timer',
    duration: seconds,
    elapsedTime: seconds,
    isRunning: false,
    startTime: null,
    ...extra,
  });

const shuffle = (names: string[], doneNames: string[] = []) =>
  widget('r', 'random', {
    mode: 'shuffle',
    lastResult: names,
    doneNames,
    firstNames: '',
    lastNames: '',
  });

const apply = (
  widgets: WidgetData[],
  patches: Record<string, object>
): WidgetData[] =>
  widgets.map((w): WidgetData =>
    patches[w.id] ? { ...w, config: { ...w.config, ...patches[w.id] } } : w
  );

const shareout = (): SequenceConnection => {
  const draft = draftFromPicks([
    { id: 'r', type: 'random' },
    { id: 't1', type: 'time-tool' },
    { id: 't2', type: 'time-tool' },
    { id: 'r', type: 'random' },
  ]);
  if (!draft.sequence) throw new Error('no sequence');
  return draft.sequence;
};

describe('draftFromPicks', () => {
  it('turns Randomizer, Timer, Timer, Randomizer into a repeating three-step Sequence', () => {
    const seq = shareout();
    expect(seq.repeat).toBe('until-done');
    expect(seq.steps.map((s) => s.actions[0])).toEqual([
      { widgetId: 'r', action: 'next' },
      { widgetId: 't1', action: 'restart' },
      { widgetId: 't2', action: 'restart' },
    ]);
  });

  it('makes Timer then Music a Follow, not a step', () => {
    const draft = draftFromPicks([
      { id: 't1', type: 'time-tool' },
      { id: 'm', type: 'music' },
    ]);
    expect(draft.sequence).toBeNull();
    expect(draft.follows).toEqual([
      expect.objectContaining({
        kind: 'follow',
        leaderId: 't1',
        followerId: 'm',
      }),
    ]);
  });

  it('makes Stations then Randomizer, picked alone, a Follow', () => {
    for (const picks of [
      [
        { id: 's', type: 'stations' as const },
        { id: 'r', type: 'random' as const },
      ],
      [
        { id: 'r', type: 'random' as const },
        { id: 's', type: 'stations' as const },
      ],
    ]) {
      const draft = draftFromPicks(picks);
      expect(draft.sequence).toBeNull();
      expect(draft.follows).toEqual([
        expect.objectContaining({ leaderId: 's', followerId: 'r' }),
      ]);
    }
  });

  it('keeps Stations and Randomizer as steps after a Timer', () => {
    const draft = draftFromPicks([
      { id: 't', type: 'time-tool' },
      { id: 's', type: 'stations' },
      { id: 'r', type: 'random' },
    ]);
    expect(draft.follows).toEqual([]);
    expect(
      draft.sequence?.steps.map((step) => step.actions[0].widgetId)
    ).toEqual(['t', 's', 'r']);
  });

  it('still makes Noise meter then Traffic Light a Follow inside a longer pick', () => {
    const draft = draftFromPicks([
      { id: 't', type: 'time-tool' },
      { id: 'n', type: 'sound' },
      { id: 'l', type: 'traffic' },
    ]);
    expect(draft.follows).toEqual([
      expect.objectContaining({ leaderId: 'n', followerId: 'l' }),
    ]);
  });

  it('does not repeat when the first widget is not picked again', () => {
    const draft = draftFromPicks([
      { id: 't1', type: 'time-tool' },
      { id: 't2', type: 'time-tool' },
    ]);
    expect(draft.sequence?.repeat).toBe('once');
  });

  it('loops until the names run out when a Randomizer is in it', () => {
    const draft = draftFromPicks([
      { id: 't1', type: 'time-tool' },
      { id: 'r', type: 'random', config: { mode: 'shuffle' } },
    ]);
    expect(draft.sequence?.repeat).toBe('until-done');
  });

  it.each(['activity-wall', 'miniApp'] as const)(
    'makes a QR code picked with %s a Follow of it, either order',
    (type) => {
      for (const picks of [
        [
          { id: 'a', type },
          { id: 'q', type: 'qr' as const },
        ],
        [
          { id: 'q', type: 'qr' as const },
          { id: 'a', type },
        ],
      ]) {
        const draft = draftFromPicks(picks);
        expect(draft.sequence).toBeNull();
        expect(draft.follows).toEqual([
          expect.objectContaining({ leaderId: 'a', followerId: 'q' }),
        ]);
      }
    }
  );
});

describe('Review live scores', () => {
  it('makes a Scoreboard picked with a Review a Follow of it, either order', () => {
    for (const picks of [
      [
        { id: 'rv', type: 'review' as const },
        { id: 'sb', type: 'scoreboard' as const },
      ],
      [
        { id: 'sb', type: 'scoreboard' as const },
        { id: 'rv', type: 'review' as const },
      ],
    ]) {
      const draft = draftFromPicks(picks);
      expect(draft.sequence).toBeNull();
      expect(draft.follows).toEqual([
        expect.objectContaining({ leaderId: 'rv', followerId: 'sb' }),
      ]);
    }
  });

  it('never connects a Quiz to a Scoreboard', () => {
    const draft = draftFromPicks([
      { id: 'qz', type: 'quiz' },
      { id: 'sb', type: 'scoreboard' },
    ]);
    expect(draft.follows).toEqual([]);
  });

  it('finds the Scoreboard following a Review, and none for a Quiz', () => {
    const widgets = [
      widget('rv', 'review', {}),
      widget('qz', 'quiz', {}),
      widget('sb', 'scoreboard', {}),
      widget('qr', 'qr', {}),
    ];
    const connections = [
      { id: 'f1', kind: 'follow' as const, leaderId: 'rv', followerId: 'qr' },
      { id: 'f2', kind: 'follow' as const, leaderId: 'rv', followerId: 'sb' },
      { id: 'f3', kind: 'follow' as const, leaderId: 'qz', followerId: 'sb' },
    ];
    expect(followingScoreboard(connections, widgets, 'rv')).toEqual({
      connection: connections[1],
      scoreboard: widgets[2],
    });
    expect(followingScoreboard(connections, widgets, 'qz')).toBeUndefined();
    expect(
      followingScoreboard(connections, widgets.slice(0, 2), 'rv')
    ).toBeUndefined();
  });
});

describe('what moves a step on', () => {
  const t = timer('t1', 120, {
    isRunning: true,
    startTime: 0,
    elapsedTime: 120,
  });
  const step = (advance?: 'now' | 'next') => ({
    id: 's',
    actions: [{ widgetId: 't1', action: 'restart' }],
    ...(advance && { advance }),
  });

  it('waits for the timer, moves on right away, or waits for Next', () => {
    expect(isStepFinished(step(), [t], 0, 1000)).toBe(false);
    expect(isStepFinished(step('now'), [t], 0, 1000)).toBe(true);
    expect(isStepFinished(step('next'), [t], 0, 999_999)).toBe(false);
  });
});

describe('shareout loop', () => {
  it('runs every name through both timers, then stops after the last name', () => {
    let seq = shareout();
    let widgets = [shuffle(['Ana', 'Ben']), timer('t1', 120), timer('t2', 30)];
    let now = 1_000_000;

    // Teacher presses play on Shareout: the Run joins at step 2.
    const startT1 = { isRunning: true, startTime: now, elapsedTime: 120 };
    widgets = apply(widgets, { t1: startT1 });
    const joined = joinRunByHand(seq, widgets, 't1', 'start', now, 'dev-a');
    if (!joined) throw new Error('did not join');
    expect(joined.sequence.run?.stepIndex).toBe(1);
    seq = joined.sequence;

    const step = (s: SequenceConnection) => s.steps[s.run?.stepIndex ?? 0];
    expect(isStepFinished(step(seq), widgets, now, now + 60_000)).toBe(false);

    // Shareout ends: Transition starts.
    now += 120_000;
    let r = advanceRun(seq, widgets, now, 'dev-a');
    expect(r.patches.t2).toMatchObject({ isRunning: true, startTime: now });
    seq = r.sequence;
    widgets = apply(widgets, r.patches);

    // Transition ends: next name crosses Ana off, then Shareout restarts.
    now += 30_000;
    expect(isStepFinished(step(seq), widgets, now, now)).toBe(true);
    r = advanceRun(seq, widgets, now, 'dev-a');
    expect(r.patches.r).toEqual({ doneNames: ['Ana'] });
    widgets = apply(widgets, r.patches);
    seq = r.sequence;
    expect(currentShuffleName(widgets[0].config as never)).toBe('Ben');
    r = advanceRun(seq, widgets, now, 'dev-a');
    expect(r.patches.t1).toMatchObject({ isRunning: true, elapsedTime: 120 });
    seq = r.sequence;
    widgets = apply(widgets, r.patches);

    // Ben's turn and transition, then the last cross-off ends the Run.
    now += 120_000;
    r = advanceRun(seq, widgets, now, 'dev-a');
    seq = r.sequence;
    widgets = apply(widgets, r.patches);
    now += 30_000;
    r = advanceRun(seq, widgets, now, 'dev-a');
    expect(r.finished).toBe(true);
    expect(r.patches.r).toEqual({ doneNames: ['Ana', 'Ben'] });
    expect(r.sequence.run).toBeNull();
  });

  it('waits while a timer in the step is paused', () => {
    const seq = { ...shareout(), run: null };
    const widgets = [
      shuffle(['Ana']),
      timer('t1', 120, { elapsedTime: 50, isRunning: false }),
      timer('t2', 30),
    ];
    expect(isStepFinished(seq.steps[1], widgets, 0, 10_000_000)).toBe(false);
  });

  it('ends the Run when a hand press runs the rest of its step out of names', () => {
    const seq: SequenceConnection = {
      ...shareout(),
      steps: [
        {
          id: 's1',
          actions: [
            { widgetId: 't1', action: 'restart' },
            { widgetId: 'r', action: 'next' },
          ],
        },
      ],
      run: null,
    };
    const widgets = [shuffle(['Ana'], []), timer('t1', 120)];
    const joined = joinRunByHand(seq, widgets, 't1', 'start', 5, 'dev-a');
    expect(joined?.patches.r).toEqual({ doneNames: ['Ana'] });
    expect(joined?.sequence.run).toBeNull();
  });

  it('runs a repeating pass where nothing waits only once', () => {
    const seq: SequenceConnection = {
      ...shareout(),
      repeat: 'until-done',
      steps: [
        { id: 'a', actions: [{ widgetId: 'l', action: 'red' }] },
        { id: 'b', actions: [{ widgetId: 'l', action: 'green' }] },
      ],
      run: { deviceId: 'd', stepIndex: 1, stepStartedAt: 0, loops: 0 },
    };
    const r = advanceRun(seq, [widget('l', 'traffic', {})], 1, 'd');
    expect(r.finished).toBe(true);
    expect(r.sequence.run).toBeNull();
  });

  it('keeps the Run on its step when the step timer resumes', () => {
    const seq: SequenceConnection = {
      ...shareout(),
      run: { deviceId: 'd', stepIndex: 1, stepStartedAt: 0, loops: 0 },
    };
    const widgets = [
      shuffle(['Ana', 'Ben']),
      timer('t1', 120, { isRunning: true, startTime: 10, elapsedTime: 60 }),
      timer('t2', 30),
    ];
    expect(joinRunByHand(seq, widgets, 't1', 'start', 20, 'd')).toBeNull();
  });

  it('stops before a step whose widget has nothing to do', () => {
    const seq: SequenceConnection = {
      ...shareout(),
      run: { deviceId: 'd', stepIndex: 2, stepStartedAt: 0, loops: 0 },
    };
    const widgets = [
      shuffle(['Ana'], ['Ana']),
      timer('t1', 120),
      timer('t2', 30),
    ];
    const r = advanceRun(seq, widgets, 1, 'd');
    expect(r.finished).toBe(true);
    expect(r.patches).toEqual({});
  });
});

describe('liveConnections', () => {
  it('drops a Connection once only one of its widgets is left', () => {
    const seq = shareout();
    expect(
      liveConnections([seq], [shuffle(['Ana']), timer('t1', 5)])
    ).toHaveLength(1);
    expect(liveConnections([seq], [timer('t1', 5)])).toHaveLength(0);
  });
});

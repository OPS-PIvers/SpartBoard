import { describe, expect, it } from 'vitest';
import type { SequenceConnection, WidgetData } from '@/types';
import {
  advanceRun,
  draftFromPicks,
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

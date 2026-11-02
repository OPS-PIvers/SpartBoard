import { describe, expect, it } from 'vitest';
import type { SequenceConnection, WidgetData } from '@/types';
import { headingAfter, loopRunsOut } from './connectionWording';

const w = (id: string, type: WidgetData['type']): WidgetData => ({
  id,
  type,
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  z: 1,
  flipped: false,
  config: {},
});

const widgets = [
  w('t', 'time-tool'),
  w('t2', 'time-tool'),
  { ...w('r', 'random'), config: { mode: 'shuffle' } },
  w('s', 'schedule'),
  w('c', 'checklist'),
];
const step = (...actions: [string, string][]) => ({
  id: actions.map((a) => a[0]).join(),
  actions: actions.map(([widgetId, action]) => ({ widgetId, action })),
});

describe('headingAfter', () => {
  it('words each row by what the step before it waits for', () => {
    expect(headingAfter(undefined, widgets)).toEqual({ kind: 'start' });
    expect(headingAfter(step(['t', 'restart']), widgets)).toEqual({
      kind: 'ends',
      widgetIds: ['t'],
    });
    expect(
      headingAfter(step(['t', 'restart'], ['t2', 'start']), widgets)
    ).toEqual({ kind: 'ends', widgetIds: ['t', 't2'] });
    expect(headingAfter(step(['r', 'next']), widgets)).toEqual({
      kind: 'right-after',
    });
    expect(headingAfter(step(['t', 'pause']), widgets)).toEqual({
      kind: 'right-after',
    });
    expect(headingAfter(step(['s', 'next-block']), widgets)).toEqual({
      kind: 'next-block',
    });
    expect(
      headingAfter({ id: 'p', actions: [], waitSeconds: 5 }, widgets)
    ).toEqual({ kind: 'after-pause' });
  });
});

describe('loopRunsOut', () => {
  const seq = (...steps: ReturnType<typeof step>[]): SequenceConnection => ({
    id: 'q',
    kind: 'sequence',
    repeat: 'until-done',
    steps,
  });

  it('names what ends the loop, or nothing for timers alone', () => {
    expect(
      loopRunsOut(seq(step(['t', 'restart']), step(['r', 'next'])), widgets)
    ).toBe('names');
    expect(
      loopRunsOut(seq(step(['c', 'next']), step(['t', 'restart'])), widgets)
    ).toBe('items');
    expect(
      loopRunsOut(seq(step(['t', 'restart']), step(['t2', 'restart'])), widgets)
    ).toBeNull();
    const picker = [
      ...widgets,
      { ...w('p', 'random'), config: { mode: 'single' } },
    ];
    expect(
      loopRunsOut(seq(step(['t', 'restart']), step(['p', 'next'])), picker)
    ).toBeNull();
  });
});

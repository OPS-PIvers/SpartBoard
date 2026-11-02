import { describe, expect, it } from 'vitest';
import type { ConnectionStep, WidgetData } from '@/types';
import {
  advanceChoice,
  fromCards,
  loopRunsOut,
  sideJoinKind,
  stepWait,
  toCards,
  widgetNames,
  withAdvance,
} from './connectionEditorModel';

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

const step = (id: string, ...actions: [string, string][]): ConnectionStep => ({
  id,
  actions: actions.map(([widgetId, action]) => ({ widgetId, action })),
});

const widgets = [
  w('t', 'time-tool', { mode: 'timer', duration: 120 }),
  w('t2', 'time-tool', { mode: 'timer', duration: 30 }),
  w('r', 'random', { mode: 'shuffle' }),
  w('s', 'schedule'),
  w('c', 'checklist'),
  w('m', 'music'),
  w('tl', 'traffic'),
];

describe('cards', () => {
  it('turns a pause step into the arrow setting of the card before it, and back', () => {
    const steps = [
      step('1', ['t', 'restart']),
      { id: 'p', actions: [], waitSeconds: 5 },
      step('2', ['r', 'next']),
    ];
    const cards = toCards(steps);
    expect(cards.map((c) => [c.step.id, c.pauseSeconds])).toEqual([
      ['1', 5],
      ['2', undefined],
    ]);
    expect(advanceChoice(cards[0])).toBe('pause');
    expect(fromCards(cards, () => 'new')).toEqual([
      steps[0],
      { id: 'new', actions: [], waitSeconds: 5 },
      steps[2],
    ]);
  });

  it('switches what moves a card on', () => {
    const card = { step: step('1', ['t', 'restart']) };
    expect(advanceChoice(card)).toBe('finish');
    expect(advanceChoice(withAdvance(card, 'next'))).toBe('next');
    expect(withAdvance(card, 'pause').pauseSeconds).toBe(10);
    expect(withAdvance(withAdvance(card, 'now'), 'finish')).toEqual(card);
  });
});

describe('stepWait', () => {
  it('names what a step waits for on its own', () => {
    expect(stepWait(step('1', ['t', 'restart']), widgets)).toEqual({
      kind: 'ends',
      widgetIds: ['t'],
    });
    expect(stepWait(step('1', ['s', 'next-block']), widgets)).toEqual({
      kind: 'next-block',
    });
    expect(stepWait(step('1', ['r', 'next']), widgets)).toBeNull();
    expect(stepWait(step('1', ['t', 'pause']), widgets)).toBeNull();
  });
});

describe('loopRunsOut', () => {
  it('names what ends the loop, or nothing for timers alone', () => {
    const seq = (...steps: ConnectionStep[]) => ({ steps });
    expect(
      loopRunsOut(
        seq(step('1', ['t', 'restart']), step('2', ['r', 'next'])),
        widgets
      )
    ).toBe('names');
    expect(loopRunsOut(seq(step('1', ['c', 'next'])), widgets)).toBe('items');
    expect(loopRunsOut(seq(step('1', ['t', 'restart'])), widgets)).toBeNull();
    const picker = [w('p', 'random', { mode: 'single' })];
    expect(loopRunsOut(seq(step('1', ['p', 'next'])), picker)).toBeNull();
  });
});

describe('widgetNames', () => {
  it('names timers by their set time and numbers a clash', () => {
    const names = widgetNames(
      [...widgets, w('t3', 'time-tool', { mode: 'timer', duration: 30 })],
      (time) => `Timer ${time}`
    );
    expect(names.get('t')).toBe('Timer 2:00');
    expect(names.get('t2')).toBe('Timer 0:30 (1)');
    expect(names.get('t3')).toBe('Timer 0:30 (2)');
  });
});

describe('sideJoinKind', () => {
  it('plays Music along with a Timer, and adds other widgets at the same moment', () => {
    expect(sideJoinKind(widgets[5], 'time-tool')).toBe('follow');
    expect(sideJoinKind(widgets[5], 'random')).toBeNull();
    expect(sideJoinKind(widgets[6], 'random')).toBe('action');
  });
});

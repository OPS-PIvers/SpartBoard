import { afterEach, describe, expect, it } from 'vitest';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  TourWidgetLayout,
  WidgetType,
} from '@/types';
import {
  claimSpawns,
  planTourSetup,
  tourLayoutOverridesAt,
} from './tourSession';
import { findTourAnchor } from './resolveTourAnchor';

const layout = (
  slot: number,
  type: WidgetType,
  xProp = slot / 10
): TourWidgetLayout => ({
  slot,
  type,
  xProp,
  yProp: 0.1,
  wProp: 0.2,
  hProp: 0.3,
});

const setOf = (
  layouts: TourWidgetLayout[],
  widgets: WidgetType[] = []
): Pick<GuidedLearningSet, 'tourSetup'> => ({
  tourSetup: { widgets, layouts },
});

const stepOf = (tour: Partial<GuidedLearningStep['tour']> = {}) =>
  ({
    id: 's',
    tour: { anchor: 'sidebar.boards', action: 'observe', ...tour },
  }) as GuidedLearningStep;

describe('planTourSetup', () => {
  it('binds each slot to its own widget when the board has two of a type', () => {
    const plan = planTourSetup(
      setOf([layout(0, 'time-tool'), layout(1, 'time-tool')], ['time-tool']),
      [],
      [
        { id: 'front', type: 'time-tool', z: 9 },
        { id: 'back', type: 'time-tool', z: 2 },
      ]
    );
    expect(plan.bind.map((b) => [b.layout.slot, b.widgetId])).toEqual([
      [0, 'back'],
      [1, 'front'],
    ]);
    expect(plan.add).toEqual([]);
  });

  it('adds the slots the board has no widget for', () => {
    const plan = planTourSetup(
      setOf([layout(0, 'clock'), layout(1, 'clock')], ['clock']),
      [],
      [{ id: 'mine', type: 'clock', z: 1 }]
    );
    expect(plan.bind).toHaveLength(1);
    expect(plan.add.map((l) => l.slot)).toEqual([1]);
  });

  it('only fills slots the tour uses, by setup type or a step slot', () => {
    const plan = planTourSetup(
      setOf(
        [layout(0, 'clock'), layout(1, 'dice'), layout(2, 'poll')],
        ['clock']
      ),
      [stepOf({ anchor: 'widget.close:poll', slot: 2 })],
      []
    );
    expect(plan.add.map((l) => l.slot)).toEqual([0, 2]);
  });

  it('adds a setup type with no layout at its default place', () => {
    const plan = planTourSetup(
      setOf([layout(0, 'clock')], ['clock', 'dice']),
      [],
      []
    );
    expect(plan.addTypes).toEqual(['dice']);
  });
});

describe('tourLayoutOverridesAt', () => {
  const steps = [
    stepOf(),
    stepOf({ layoutKeyframes: [layout(0, 'clock', 0.7)] }),
    stepOf({ layoutKeyframes: [layout(1, 'clock', 0.9)] }),
  ];
  const slots = { 0: 'mine', 1: 'tour-added' };
  const moved = { 0: layout(0, 'clock', 0.2) };

  it('moves the teacher widget to its slot layout from the first step', () => {
    const map = tourLayoutOverridesAt(steps, 0, slots, moved);
    expect([...map.keys()]).toEqual(['mine']);
    expect(map.get('mine')?.xProp).toBe(0.2);
  });

  it('applies every keyframe up to the current step, and none after', () => {
    expect(
      tourLayoutOverridesAt(steps, 1, slots, moved).get('mine')?.xProp
    ).toBe(0.7);
    expect(
      tourLayoutOverridesAt(steps, 1, slots, moved).has('tour-added')
    ).toBe(false);
    expect(
      tourLayoutOverridesAt(steps, 2, slots, moved).get('tour-added')?.xProp
    ).toBe(0.9);
  });

  it('skips keyframes for slots nothing is bound to', () => {
    expect(tourLayoutOverridesAt(steps, 2, { 0: 'mine' }, moved).size).toBe(1);
  });
});

describe('claimSpawns', () => {
  const watch = { layout: layout(3, 'dice'), seen: ['old'] };

  it('binds the first new widget of the type to the spawned slot', () => {
    const out = claimSpawns(
      [
        { id: 'old', type: 'dice' },
        { id: 'new', type: 'dice' },
      ],
      [watch],
      {}
    );
    expect(out.slots).toEqual({ 3: 'new' });
    expect(out.bound).toEqual([watch.layout]);
    expect(out.watches).toEqual([]);
  });

  it('keeps waiting while no new widget of the type is open', () => {
    const out = claimSpawns([{ id: 'old', type: 'dice' }], [watch], {});
    expect(out.bound).toEqual([]);
    expect(out.watches).toEqual([watch]);
  });

  it('never binds a widget another slot holds', () => {
    const out = claimSpawns([{ id: 'new', type: 'dice' }], [watch], {
      0: 'new',
    });
    expect(out.bound).toEqual([]);
  });
});

describe('findTourAnchor with slots', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves a slotted anchor to the bound widget, not the first of its type', () => {
    document.body.innerHTML = `
      <button data-tour="widget.settings-opener" data-tour-widget="a" data-tour-widget-type="clock">A</button>
      <button data-tour="widget.settings-opener" data-tour-widget="b" data-tour-widget-type="clock">B</button>`;
    for (const el of document.querySelectorAll('button'))
      el.getBoundingClientRect = () => new DOMRect(0, 0, 20, 20);
    const binding = { anchor: 'widget.settings-opener:clock', slot: 1 };
    expect(findTourAnchor(binding, { slots: { 1: 'b' } })?.textContent).toBe(
      'B'
    );
    expect(findTourAnchor(binding, { slots: { 1: 'gone' } })).toBeNull();
    expect(findTourAnchor(binding)?.textContent).toBe('A');
  });
});

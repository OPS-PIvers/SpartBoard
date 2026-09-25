import { describe, expect, it } from 'vitest';
import type { WidgetData, WidgetType } from '@/types';
import {
  boardLayoutOf,
  buildRecordedLayouts,
  type RecordedBoardWidget,
} from './recordedLayouts';
import { buildRecordedSet } from './buildRecordedSet';
import type { RecordedStep } from './useTourCapture';

const at = (
  id: string,
  type: WidgetType,
  z: number,
  xProp = 0.1
): RecordedBoardWidget => ({
  id,
  type,
  z,
  xProp,
  yProp: 0.2,
  wProp: 0.3,
  hProp: 0.4,
});

describe('boardLayoutOf', () => {
  it('keeps appearance keys and drops content', () => {
    const widget = {
      id: 'w',
      type: 'text',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      xProp: 0.123456,
      yProp: 0.2,
      wProp: 0.3,
      hProp: 0.4,
      z: 1,
      flipped: false,
      config: { content: 'Alice Nguyen', fontFamily: 'lexend' },
    } as unknown as WidgetData;
    const [snap] = boardLayoutOf([widget]);
    expect(snap.xProp).toBe(0.1235);
    expect(snap.appearance).toEqual({ fontFamily: 'lexend' });
    expect(JSON.stringify(snap)).not.toContain('Alice');
  });

  it('leaves out unsaved tour widgets', () => {
    const widget = {
      id: 't',
      type: 'clock',
      transient: true,
      config: {},
    } as unknown as WidgetData;
    expect(boardLayoutOf([widget])).toEqual([]);
  });
});

describe('buildRecordedLayouts', () => {
  it('numbers setup slots in z-order', () => {
    const { layouts, slotOf } = buildRecordedLayouts(
      [at('top', 'clock', 9), at('bottom', 'clock', 1)],
      []
    );
    expect(layouts.map((l) => l.slot)).toEqual([0, 1]);
    expect(slotOf.get('bottom')).toBe(0);
    expect(slotOf.get('top')).toBe(1);
  });

  it('puts a widget opened after a click on that step as a new slot', () => {
    const start = [at('a', 'clock', 1)];
    const { steps, slotOf } = buildRecordedLayouts(
      start,
      [start, [...start, at('b', 'dice', 2)]],
      [...start, at('b', 'dice', 2), at('c', 'poll', 3)]
    );
    expect(steps[0].spawns).toMatchObject({ slot: 1, type: 'dice' });
    expect(steps[1].spawns).toMatchObject({ slot: 2, type: 'poll' });
    expect(slotOf.get('c')).toBe(2);
  });

  it('keyframes only the widgets whose place changed since the last step', () => {
    const start = [at('a', 'clock', 1), at('b', 'dice', 2)];
    const moved = [at('a', 'clock', 1, 0.6), at('b', 'dice', 2)];
    const { steps } = buildRecordedLayouts(start, [start, moved, moved]);
    expect(steps[0].layoutKeyframes).toBeUndefined();
    expect(steps[1].layoutKeyframes).toEqual([
      { slot: 0, xProp: 0.6, yProp: 0.2, wProp: 0.3, hProp: 0.4 },
    ]);
    expect(steps[2].layoutKeyframes).toBeUndefined();
  });
});

describe('buildRecordedSet layouts', () => {
  const step = (
    id: string,
    anchor: string,
    board: RecordedBoardWidget[],
    widgetId?: string
  ): RecordedStep => ({
    id,
    xPct: 0,
    yPct: 0,
    region: { shape: 'rect', wPct: 1, hPct: 1 },
    tour: { anchor, action: 'click' },
    frameIndex: 0,
    untagged: false,
    board,
    ...(widgetId ? { widgetId } : {}),
  });

  it('saves setup layouts, and a widget-scoped anchor gets its type and slot', async () => {
    const start = [at('t1', 'time-tool', 1), at('t2', 'time-tool', 2)];
    const { set } = await buildRecordedSet(
      {
        steps: [
          step('a', 'widget.settings-opener', start, 't2'),
          step('b', 'sidebar.boards', start),
        ],
      },
      {
        id: 'set',
        title: 'T',
        imageUrls: ['u'],
        widgets: [
          { id: 't1', type: 'time-tool' },
          { id: 't2', type: 'time-tool' },
        ],
        startIds: new Set(['t1', 't2']),
        startBoard: start,
      }
    );
    expect(set.tourSetup?.layouts?.map((l) => l.slot)).toEqual([0, 1]);
    expect(set.steps[0].tour).toMatchObject({
      anchor: 'widget.settings-opener:time-tool',
      slot: 1,
    });
    expect(set.steps[1].tour?.slot).toBeUndefined();
    expect(JSON.stringify(set)).not.toContain('"board"');
  });

  it('records no layouts without a start board', async () => {
    const { set } = await buildRecordedSet(
      { steps: [step('a', 'sidebar.boards', [])] },
      {
        id: 'set',
        title: 'T',
        imageUrls: ['u'],
        widgets: [],
        startIds: new Set(),
      }
    );
    expect(set.tourSetup).toEqual({ widgets: [] });
  });
});

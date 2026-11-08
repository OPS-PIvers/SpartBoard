import { describe, it, expect } from 'vitest';
import type { WidgetData } from '@/types';
import {
  createWidgetHistoryStack,
  recordWidgetHistory,
  setWidgetHistoryAfter,
  undoWidgetHistory,
  redoWidgetHistory,
  revertWidgetHistoryEntry,
  replayWidgetHistoryEntry,
  applyWidgetDiff,
  WIDGET_HISTORY_LIMIT,
  WIDGET_HISTORY_COALESCE_MS,
} from './widgetHistory';

const widget = (
  id: string,
  x = 0,
  config: Record<string, unknown> = {}
): WidgetData => ({
  id,
  type: 'text',
  x,
  y: 0,
  w: 100,
  h: 100,
  z: 1,
  flipped: false,
  config,
});

describe('widgetHistory', () => {
  it('undoes and redoes a removal', () => {
    const stack = createWidgetHistoryStack();
    const before = [widget('a'), widget('b')];
    const after = [widget('a')];

    expect(recordWidgetHistory(stack, before, null, 0)).toBe(true);
    setWidgetHistoryAfter(stack, after);
    const entry = undoWidgetHistory(stack, after);
    if (!entry) throw new Error('no entry');
    expect(revertWidgetHistoryEntry(entry, after).map((w) => w.id)).toEqual([
      'a',
      'b',
    ]);
    expect(stack.undo).toHaveLength(0);
    const redo = redoWidgetHistory(stack, before);
    if (!redo) throw new Error('no redo');
    expect(replayWidgetHistoryEntry(redo, before).map((w) => w.id)).toEqual([
      'a',
    ]);
    expect(stack.undo).toHaveLength(1);
    expect(stack.redo).toHaveLength(0);
  });

  it('coalesces rapid updates to the same widget into one entry', () => {
    const stack = createWidgetHistoryStack();
    const s0 = [widget('a', 0)];
    const s1 = [widget('a', 10)];
    const s2 = [widget('a', 20)];

    expect(recordWidgetHistory(stack, s0, 'a', 0)).toBe(true);
    expect(recordWidgetHistory(stack, s1, 'a', 200)).toBe(false);
    expect(recordWidgetHistory(stack, s2, 'a', 400)).toBe(false);
    expect(stack.undo).toHaveLength(1);
    expect(undoWidgetHistory(stack, [])?.before).toBe(s0);
  });

  it('starts a new entry after the coalesce window or for another widget', () => {
    const stack = createWidgetHistoryStack();
    recordWidgetHistory(stack, [widget('a', 0)], 'a', 0);
    recordWidgetHistory(
      stack,
      [widget('a', 10)],
      'a',
      WIDGET_HISTORY_COALESCE_MS + 1
    );
    recordWidgetHistory(
      stack,
      [widget('a', 20)],
      'b',
      WIDGET_HISTORY_COALESCE_MS + 2
    );
    expect(stack.undo).toHaveLength(3);
  });

  it('dedupes the same pre-state recorded twice in one batch', () => {
    const stack = createWidgetHistoryStack();
    const before = [widget('a')];
    recordWidgetHistory(stack, before, null, 0);
    expect(recordWidgetHistory(stack, before, null, 5000)).toBe(false);
    expect(stack.undo).toHaveLength(1);
  });

  it('clears redo when a new change is recorded', () => {
    const stack = createWidgetHistoryStack();
    const s0 = [widget('a')];
    recordWidgetHistory(stack, s0, null, 0);
    undoWidgetHistory(stack, []);
    expect(stack.redo).toHaveLength(1);
    recordWidgetHistory(stack, s0, null, 5000);
    expect(stack.redo).toHaveLength(0);
  });

  it('caps the undo stack', () => {
    const stack = createWidgetHistoryStack();
    for (let i = 0; i < WIDGET_HISTORY_LIMIT + 10; i++) {
      recordWidgetHistory(stack, [widget('a', i)], null, i * 5000);
    }
    expect(stack.undo).toHaveLength(WIDGET_HISTORY_LIMIT);
    expect(stack.undo[0].before[0].x).toBe(10);
  });

  it('does not fold an edit after undo into an older same-widget entry', () => {
    const stack = createWidgetHistoryStack();
    const s0 = [widget('a', 0), widget('b', 0)];
    const s1 = [widget('a', 10), widget('b', 0)];
    recordWidgetHistory(stack, s0, 'a', 0);
    recordWidgetHistory(stack, s1, 'b', 100);
    expect(undoWidgetHistory(stack, [])?.before).toBe(s1);
    expect(recordWidgetHistory(stack, s1, 'a', 200)).toBe(true);
    expect(stack.undo).toHaveLength(2);
  });

  it('redo does not fold a later edit into the replayed entry', () => {
    const stack = createWidgetHistoryStack();
    const s0 = [widget('a', 0)];
    recordWidgetHistory(stack, s0, 'a', 0);
    undoWidgetHistory(stack, []);
    redoWidgetHistory(stack, []);
    expect(recordWidgetHistory(stack, [widget('a', 10)], 'a', 100)).toBe(true);
    expect(stack.undo).toHaveLength(2);
  });
});

describe('applyWidgetDiff', () => {
  it('reverts only the moved widget and leaves a system write on another widget', () => {
    const before = [widget('a', 0), widget('t', 0, { startTime: 1 })];
    const after = [widget('a', 50), widget('t', 0, { startTime: 1 })];
    const current = [
      widget('a', 50),
      { ...widget('t', 0, { startTime: 99, isRunning: true }), version: 4 },
    ];
    const result = applyWidgetDiff(after, before, current);
    expect(result[0].x).toBe(0);
    expect(result[1]).toBe(current[1]);
  });

  it('restores only the config keys the step changed on the same widget', () => {
    const before = [widget('t', 0, { duration: 60, startTime: null })];
    const after = [widget('t', 0, { duration: 120, startTime: null })];
    const current = [
      {
        ...widget('t', 0, { duration: 120, startTime: 99, isRunning: true }),
        version: 3,
      },
    ];
    const [t] = applyWidgetDiff(after, before, current);
    expect(t.config).toEqual({
      duration: 60,
      startTime: 99,
      isRunning: true,
    });
    expect(t.version).toBe(4);
  });

  it('removes a key the step added and keeps untouched fields', () => {
    const before = [widget('a', 0, { text: 'x' })];
    const after = [{ ...widget('a', 0, { text: 'x', title: 'Hi' }), y: 40 }];
    const current = [{ ...after[0], h: 300 }];
    const [a] = applyWidgetDiff(after, before, current);
    expect(a.config).toEqual({ text: 'x' });
    expect(a.y).toBe(0);
    expect(a.h).toBe(300);
  });

  it('keeps widgets added elsewhere and removes only the one the step added', () => {
    const before = [widget('a')];
    const after = [widget('a'), widget('new')];
    const current = [widget('a'), widget('new'), widget('other')];
    expect(applyWidgetDiff(after, before, current).map((w) => w.id)).toEqual([
      'a',
      'other',
    ]);
  });

  it('puts a restored widget back after its earlier neighbour', () => {
    const before = [widget('a'), widget('b'), widget('c')];
    const after = [widget('a'), widget('c')];
    const current = [widget('a'), widget('c'), widget('tour')];
    expect(applyWidgetDiff(after, before, current).map((w) => w.id)).toEqual([
      'a',
      'b',
      'c',
      'tour',
    ]);
  });

  it('does not resurrect a widget the step removed if it is already back', () => {
    const before = [widget('a'), widget('b')];
    const after = [widget('a')];
    const current = [widget('a'), widget('b', 7)];
    const result = applyWidgetDiff(after, before, current);
    expect(result).toBe(current);
  });

  it('refreshes only the written config keys of a coalesced widget', () => {
    const stack = createWidgetHistoryStack();
    const s0 = [widget('t', 0, { duration: 60, startTime: null })];
    recordWidgetHistory(stack, s0, 't', 0);
    setWidgetHistoryAfter(
      stack,
      [widget('t', 10, { duration: 90, startTime: 99 })],
      new Map([['t', new Set(['duration'])]])
    );
    const after = stack.undo[0].after[0];
    expect(after.x).toBe(10);
    expect(after.config).toEqual({ duration: 90, startTime: null });
  });

  it('returns the same array when the step has nothing left to change', () => {
    const before = [widget('a', 0)];
    const after = [widget('a', 10)];
    const current = [widget('a', 0)];
    expect(applyWidgetDiff(after, before, current)).toBe(current);
  });
});

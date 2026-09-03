import { describe, it, expect } from 'vitest';
import type { WidgetData } from '@/types';
import {
  createWidgetHistoryStack,
  recordWidgetHistory,
  undoWidgetHistory,
  redoWidgetHistory,
  WIDGET_HISTORY_LIMIT,
  WIDGET_HISTORY_COALESCE_MS,
} from './widgetHistory';

const widget = (id: string, x = 0): WidgetData => ({
  id,
  type: 'text',
  x,
  y: 0,
  w: 100,
  h: 100,
  z: 1,
  flipped: false,
  config: {},
});

describe('widgetHistory', () => {
  it('undoes and redoes a removal', () => {
    const stack = createWidgetHistoryStack();
    const before = [widget('a'), widget('b')];
    const after = [widget('a')];

    expect(recordWidgetHistory(stack, before, null, 0)).toBe(true);
    expect(undoWidgetHistory(stack, after)).toBe(before);
    expect(stack.undo).toHaveLength(0);
    expect(redoWidgetHistory(stack, before)).toBe(after);
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
    expect(undoWidgetHistory(stack, [widget('a', 30)])).toBe(s0);
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
    const s1: WidgetData[] = [];
    recordWidgetHistory(stack, s0, null, 0);
    undoWidgetHistory(stack, s1);
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
    expect(stack.undo[0].widgets[0].x).toBe(10);
  });
});

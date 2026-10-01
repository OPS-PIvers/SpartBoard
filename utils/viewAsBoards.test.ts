import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard, WidgetData } from '@/types';
import {
  diffViewAsBoards,
  discardViewAsChange,
  getViewAsWorkingCopy,
  markViewAsChangeApproved,
  publishViewAsLocalBoards,
  reconcileViewAsSnapshot,
  registerViewAsLocalWriter,
  resetViewAsWorkingCopy,
} from './viewAsBoards';

const widget = (over: Partial<WidgetData> = {}): WidgetData =>
  ({
    id: 'w1',
    type: 'clock',
    x: 100,
    y: 100,
    w: 200,
    h: 200,
    xProp: 0.1,
    yProp: 0.1,
    wProp: 0.2,
    hProp: 0.2,
    z: 1,
    flipped: false,
    version: 1,
    config: { format24: false },
    ...over,
  }) as WidgetData;

const board = (widgets: WidgetData[], over: Partial<Dashboard> = {}) =>
  ({
    id: 'b1',
    name: 'Period 1',
    background: 'bg-slate-100',
    widgets,
    createdAt: 1,
    ...over,
  }) as Dashboard;

const edit = (d: Dashboard, patch: Partial<WidgetData>, id = 'w1') => ({
  ...d,
  widgets: d.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
});

const pending = () => {
  publishViewAsLocalBoards(local);
  return diffViewAsBoards(getViewAsWorkingCopy());
};

let local: Dashboard[] = [];

describe('view-as working copy', () => {
  beforeEach(() => {
    resetViewAsWorkingCopy();
    local = reconcileViewAsSnapshot([board([widget()])], []);
  });

  it('follows their latest board while nothing was edited here', () => {
    const remote = board([widget({ xProp: 0.5 })]);
    local = reconcileViewAsSnapshot([remote], local);
    expect(local[0]).toBe(remote);
    expect(pending()).toEqual([]);
  });

  it('keeps an edited board and lists layout and config separately', () => {
    local = [edit(local[0], { xProp: 0.4, config: { format24: true } })];
    local = reconcileViewAsSnapshot([board([widget({ z: 9 })])], local);
    expect(local[0].widgets[0].xProp).toBe(0.4);
    const items = pending();
    expect(items.map((c) => c.kind)).toEqual(['layout', 'config']);
    expect(items[0].before).toEqual({ xProp: 0.1 });
    expect(items[0].after).toEqual({ xProp: 0.4 });
    expect(items[1].after).toEqual({ config: { format24: true } });
    expect(items.every((c) => !c.stale)).toBe(true);
  });

  it('ignores pixel-only changes from a resize', () => {
    local = [edit(local[0], { x: 300, w: 500 })];
    expect(pending()).toEqual([]);
  });

  it('keeps added and removed widgets and boards local, never pending', () => {
    local = [
      { ...local[0], widgets: [widget({ id: 'w2' })] },
      board([], { id: 'b2', name: 'New' }),
    ];
    expect(pending()).toEqual([]);
    local = reconcileViewAsSnapshot([board([widget()])], local);
    expect(local.map((d) => d.id)).toEqual(['b1', 'b2']);
  });

  it('keeps a board deleted here deleted', () => {
    local = reconcileViewAsSnapshot([board([widget()])], []);
    expect(local).toEqual([]);
  });

  it('scrubs PII from config so a restored roster is not a change', () => {
    local = [edit(local[0], { config: { format24: false, roster: ['Ada'] } })];
    expect(pending()).toEqual([]);
  });

  it('marks an item stale when the widget is gone from their latest board', () => {
    local = [edit(local[0], { z: 5 })];
    local = reconcileViewAsSnapshot([board([])], local);
    const [item] = pending();
    expect(item.stale).toBe(true);
  });

  it('drops an approved item and adopts their board once nothing is left', () => {
    local = [edit(local[0], { xProp: 0.4, version: 2, config: { a: 1 } })];
    const items = pending();
    items.forEach(markViewAsChangeApproved);
    expect(pending()).toEqual([]);
    const after = board([widget({ xProp: 0.4, version: 2, config: { a: 1 } })]);
    local = reconcileViewAsSnapshot([after], local);
    expect(local[0]).toBe(after);
  });

  it('discard writes the baseline fields back through the registered writer', () => {
    const writer = vi.fn();
    registerViewAsLocalWriter(writer);
    local = [edit(local[0], { xProp: 0.4, x: 400 })];
    discardViewAsChange(pending()[0]);
    expect(writer).toHaveBeenCalledWith(
      'b1',
      'w1',
      expect.objectContaining({ xProp: 0.1, x: 100 })
    );
  });
});

import { describe, it, expect } from 'vitest';
import { mergeDashboardForSave, type SaveBaseline } from './dashboardSaveMerge';
import type { Dashboard, WidgetData } from '@/types';

const textOf = (w: WidgetData) => (w.config as { text: string }).text;

const widget = (id: string, text: string, extra: Partial<WidgetData> = {}) =>
  ({
    id,
    type: 'text',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    config: { text },
    ...extra,
  }) as WidgetData;

const board = (widgets: WidgetData[], extra: Partial<Dashboard> = {}) =>
  ({
    id: 'd1',
    name: 'Board',
    background: 'bg-slate-900',
    widgets,
    createdAt: 1,
    ...extra,
  }) as Dashboard;

const baselineOf = (d: Dashboard): SaveBaseline => ({
  updatedAt: 100,
  widgets: JSON.parse(JSON.stringify(d.widgets)) as WidgetData[],
  background: d.background,
  name: d.name,
  libraryOrder: JSON.stringify(d.libraryOrder ?? []),
  settings: JSON.stringify(d.settings ?? {}),
});

describe('mergeDashboardForSave', () => {
  it('keeps local edits and takes server edits for untouched widgets', () => {
    const base = board([widget('a', 'a0'), widget('b', 'b0')]);
    const local = board([widget('a', 'a-local'), widget('b', 'b0')]);
    const server = board([widget('a', 'a0'), widget('b', 'b-server')]);

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(merged.widgets.map(textOf)).toEqual(['a-local', 'b-server']);
  });

  it('takes the server layout for a widget only edited remotely and keeps local pixels', () => {
    const base = board([widget('a', 'a0', { xProp: 0.1 })]);
    const local = board([widget('a', 'a0', { xProp: 0.1, x: 42 })]);
    const server = board([widget('a', 'a0', { xProp: 0.5, x: 900 })]);

    const [a] = mergeDashboardForSave(local, server, baselineOf(base)).widgets;

    expect(a.xProp).toBe(0.5);
    expect(a.x).toBe(42);
  });

  it('honours remote adds and deletes, and keeps local adds and deletes', () => {
    const base = board([widget('gone-remote', 'x'), widget('gone-local', 'y')]);
    const local = board([widget('gone-remote', 'x'), widget('new-local', 'l')]);
    const server = board([
      widget('gone-local', 'y'),
      widget('new-remote', 'r'),
    ]);

    const ids = mergeDashboardForSave(
      local,
      server,
      baselineOf(base)
    ).widgets.map((w) => w.id);

    expect(ids).toEqual(['new-local', 'new-remote']);
  });

  it('merges top-level fields the same way', () => {
    const base = board([], { settings: { spotlight: false } as never });
    const local = board([], {
      name: 'Renamed locally',
      settings: { spotlight: false } as never,
    });
    const server = board([], {
      background: 'bg-red-500',
      settings: { spotlight: true } as never,
    });

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(merged.name).toBe('Renamed locally');
    expect(merged.background).toBe('bg-red-500');
    expect(merged.settings).toEqual({ spotlight: true });
  });
});

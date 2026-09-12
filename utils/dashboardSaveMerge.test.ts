import { describe, it, expect } from 'vitest';
import {
  DASHBOARD_FIELDS,
  mergeDashboardForSave,
  serializeDashboardField,
  type SaveBaseline,
} from './dashboardSaveMerge';
import { stableStringify } from './stableStringify';
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
  widgets: JSON.parse(JSON.stringify(d.widgets)) as WidgetData[],
  background: d.background,
  name: d.name,
  libraryOrder: JSON.stringify(d.libraryOrder ?? []),
  settings: stableStringify(d.settings ?? {}),
  dashboardFields: Object.fromEntries(
    DASHBOARD_FIELDS.map((f) => [f, serializeDashboardField(d[f])])
  ),
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

  it('takes the server value for board fields this device has not touched', () => {
    // pinBoard / moveBoardToCollection write these with a targeted updateDoc,
    // so a stale autosave used to revert them.
    const base = board([], { isPinned: false, collectionId: null, order: 0 });
    const local = board([], { isPinned: false, collectionId: null, order: 5 });
    const server = board([], { isPinned: true, collectionId: 'c1', order: 0 });

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(merged.isPinned).toBe(true);
    expect(merged.collectionId).toBe('c1');
    // Reordered locally, so the local value wins over the server's.
    expect(merged.order).toBe(5);
  });

  it('keeps local board fields when the baseline does not describe them', () => {
    const base = board([], { isPinned: true });
    const local = board([], { isPinned: true });
    const server = board([], { isPinned: false });

    const merged = mergeDashboardForSave(local, server, {
      ...baselineOf(base),
      dashboardFields: {},
    });

    expect(merged.isPinned).toBe(true);
  });

  it('takes remote board ink this device has not drawn over', () => {
    // Board ink is persistent state, so an autosave that did not touch it must
    // not revert strokes another device drew.
    const ink = (n: number) =>
      ({ objects: [{ id: `o${n}` }], updatedAt: n }) as never;
    const base = board([], { annotationOverlay: ink(1) });
    const local = board([], { annotationOverlay: ink(1) });
    const server = board([], { annotationOverlay: ink(2) });

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(merged.annotationOverlay?.updatedAt).toBe(2);
  });

  it('keeps board ink drawn locally since the baseline', () => {
    const ink = (n: number) =>
      ({ objects: [{ id: `o${n}` }], updatedAt: n }) as never;
    const base = board([], { annotationOverlay: ink(1) });
    const local = board([], { annotationOverlay: ink(3) });
    const server = board([], { annotationOverlay: ink(2) });

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(merged.annotationOverlay?.updatedAt).toBe(3);
  });

  it('accepts server settings and libraryOrder when the baseline captured them as undefined', () => {
    // JSON.stringify(undefined) is undefined, so an uncoalesced baseline looked locally edited forever.
    const local = board([]);
    const server = board([], {
      settings: { spotlight: true } as never,
      libraryOrder: ['text'],
    });

    const merged = mergeDashboardForSave(local, server, {
      ...baselineOf(board([])),
      libraryOrder: undefined as unknown as string,
      settings: undefined as unknown as string,
    });

    expect(merged.settings).toEqual({ spotlight: true });
    expect(merged.libraryOrder).toEqual(['text']);
  });

  it('takes a remote config edit for a version-less widget whose local copy is only key-reordered', () => {
    // Same config content as base, different key order (as Firestore echoes it back) —
    // must still read as "unchanged locally" so the server's real edit isn't dropped.
    const base = board([
      widget('a', 'x', { config: { text: 'x', color: 'red' } }),
    ]);
    const local = board([
      widget('a', 'x', { config: { color: 'red', text: 'x' } }),
    ]);
    const server = board([
      widget('a', 'x', { config: { color: 'blue', text: 'x' } }),
    ]);

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(merged.widgets[0].config).toEqual({ color: 'blue', text: 'x' });
  });

  it('takes a remote annotation edit when the local copy is unchanged but key-reordered', () => {
    const path = (color: string, reordered = false) =>
      reordered
        ? { width: 2, color, points: [] }
        : { points: [], color, width: 2 };
    const base = board([
      widget('a', 'x', {
        annotation: { mode: 'window', paths: [path('red')] },
      }),
    ]);
    const local = board([
      widget('a', 'x', {
        annotation: { paths: [path('red', true)], mode: 'window' },
      }),
    ]);
    const server = board([
      widget('a', 'x', {
        annotation: { mode: 'window', paths: [path('blue')] },
      }),
    ]);

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(merged.widgets[0].annotation).toEqual(server.widgets[0].annotation);
  });

  it('treats an absent field and an explicit null as the same baseline value', () => {
    const base = board([]);
    const local = board([]);
    const server = board([], { thumbnailUrl: 'https://example.test/t.png' });

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(merged.thumbnailUrl).toBe('https://example.test/t.png');
  });

  it('takes a remote object-field edit when the local copy is unchanged but key-reordered', () => {
    // Same content as base, different key order — must still read as "unchanged locally".
    const base = board([], {
      globalStyle: { fontFamily: 'Lexend', fontColor: '#fff' } as never,
    });
    const local = board([], {
      globalStyle: { fontColor: '#fff', fontFamily: 'Lexend' } as never,
    });
    const server = board([], {
      globalStyle: {
        fontColor: '#fff',
        fontFamily: 'Lexend',
        cardColor: '#000',
      } as never,
    });

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(merged.globalStyle).toEqual(server.globalStyle);
  });

  it('takes a remote settings edit when the local copy is unchanged but key-reordered', () => {
    // Same content as base, different key order (as Firestore echoes a map field back) —
    // must still read as "unchanged locally" so the server's real settings edit isn't dropped.
    const base = board([], {
      settings: {
        disableCloseConfirmation: true,
        remoteControlEnabled: false,
      } as never,
    });
    const local = board([], {
      settings: {
        remoteControlEnabled: false,
        disableCloseConfirmation: true,
      } as never,
    });
    const server = board([], {
      settings: {
        disableCloseConfirmation: true,
        remoteControlEnabled: true,
      } as never,
    });

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(merged.settings).toEqual(server.settings);
  });
});

describe('configVersion travels with config', () => {
  it('takes the server stamp whenever it takes the server config', () => {
    const base = board([widget('w1', 'a', { configVersion: 1 })]);
    const local = board([widget('w1', 'a', { configVersion: 1 })]);
    const server = board([widget('w1', 'server', { configVersion: 0 })]);

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(textOf(merged.widgets[0])).toBe('server');
    expect(merged.widgets[0].configVersion).toBe(0);
  });

  it('keeps the local stamp when the local config wins', () => {
    const base = board([widget('w1', 'a', { configVersion: 0 })]);
    const local = board([widget('w1', 'local', { configVersion: 1 })]);
    const server = board([widget('w1', 'server', { configVersion: 0 })]);

    const merged = mergeDashboardForSave(local, server, baselineOf(base));

    expect(textOf(merged.widgets[0])).toBe('local');
    expect(merged.widgets[0].configVersion).toBe(1);
  });
});

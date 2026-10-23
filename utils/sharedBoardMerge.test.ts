import { describe, expect, it } from 'vitest';
import type { Dashboard, WidgetData } from '@/types';
import {
  mergeSharedBoard,
  mergeSharedWidgets,
  sharedBoardBaseline,
  type SharedBoardBaseline,
} from '@/utils/sharedBoardMerge';

const w = (id: string, extra: Partial<WidgetData> = {}): WidgetData => ({
  id,
  type: 'clock',
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  xProp: 0.1,
  yProp: 0.1,
  wProp: 0.2,
  hProp: 0.2,
  aspectRatio: 1,
  z: 1,
  flipped: false,
  config: {},
  ...extra,
});

const board = (widgets: WidgetData[]): Dashboard => ({
  id: 'b',
  name: 'B',
  background: 'bg-slate-800',
  widgets,
  createdAt: 1,
});

// One co-teacher's tab: a local copy, the share as last received, and a mirror
// write that merges against the server like the real transaction does.
class Tab {
  local: Dashboard;
  base: SharedBoardBaseline;
  constructor(server: Dashboard) {
    this.local = structuredClone(server);
    this.base = sharedBoardBaseline(structuredClone(server));
  }
  receive(server: Dashboard) {
    this.local = {
      ...this.local,
      widgets: mergeSharedWidgets(
        this.local.widgets,
        server.widgets,
        this.base.widgets
      ),
    };
    this.base = sharedBoardBaseline(structuredClone(server));
  }
  write(server: Dashboard): Dashboard {
    return structuredClone({
      ...this.local,
      ...mergeSharedBoard(this.local, server, this.base),
    });
  }
}

describe('mergeSharedWidgets', () => {
  it('keeps a local add and a remote move of another widget', () => {
    const base = [w('a')];
    const local = [w('a'), w('clock')];
    const server = [w('a', { xProp: 0.6 })];
    expect(mergeSharedWidgets(local, server, base)).toEqual([
      w('a', { xProp: 0.6 }),
      w('clock'),
    ]);
  });

  it('honours a remote delete of an untouched widget and a local delete', () => {
    const base = [w('a'), w('b')];
    const local = [w('a')];
    const server = [w('b')];
    expect(mergeSharedWidgets(local, server, base)).toEqual([]);
  });

  it('merges different field groups of the same widget', () => {
    const base = [w('a')];
    const local = [
      w('a', { config: { hour24: true } as WidgetData['config'] }),
    ];
    const server = [w('a', { xProp: 0.7 })];
    const [merged] = mergeSharedWidgets(local, server, base);
    expect(merged.xProp).toBe(0.7);
    expect(merged.config).toEqual({ hour24: true });
  });

  it('follows the server order so both tabs settle on the same array', () => {
    const base = [w('a'), w('b')];
    const local = [w('b'), w('a')];
    const server = [w('a'), w('b'), w('c')];
    expect(mergeSharedWidgets(local, server, base).map((x) => x.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('concurrent settings edits on one widget', () => {
  const cfg = (c: Record<string, number>) => c as WidgetData['config'];

  it('keeps both keys though both edits reached the same version', () => {
    const base = [w('a', { version: 5, config: cfg({ j: 0, k: 0 }) })];
    const local = [w('a', { version: 6, config: cfg({ j: 1, k: 0 }) })];
    const server = [w('a', { version: 6, config: cfg({ j: 0, k: 1 }) })];
    const [merged] = mergeSharedWidgets(local, server, base);
    expect(merged.config).toEqual({ j: 1, k: 1 });
    // Newer than the share's, so the mirror still sends it.
    expect(merged.version).toBe(7);

    // The next snapshot (base is now the server copy) must not revert j.
    const [again] = mergeSharedWidgets([merged], server, server);
    expect(again.config).toEqual({ j: 1, k: 1 });
  });

  it('takes the share version once the configs match', () => {
    const base = [w('a', { version: 5, config: cfg({ j: 0 }) })];
    const server = [w('a', { version: 9, config: cfg({ j: 2 }) })];
    const [merged] = mergeSharedWidgets(base, server, base);
    expect(merged).toEqual(server[0]);
  });
});

describe('two co-teachers editing at once', () => {
  it('keeps both edits when both write before seeing the other', () => {
    let server = board([w('a')]);
    const paul = new Tab(server);
    const colleague = new Tab(server);

    paul.local = {
      ...paul.local,
      widgets: [...paul.local.widgets, w('clock')],
    };
    colleague.local = {
      ...colleague.local,
      widgets: [w('a', { xProp: 0.6, yProp: 0.4 })],
    };

    server = colleague.write(server);
    server = paul.write(server); // Paul's write lands second
    paul.receive(server);
    colleague.receive(server);

    for (const tab of [paul, colleague]) {
      expect(tab.local.widgets.map((x) => x.id)).toEqual(['a', 'clock']);
      expect(tab.local.widgets[0].xProp).toBe(0.6);
    }
  });
});

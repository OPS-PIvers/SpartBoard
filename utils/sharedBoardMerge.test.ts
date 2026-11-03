import { describe, expect, it } from 'vitest';
import type { Dashboard, WidgetConnection, WidgetData } from '@/types';
import {
  mergeSharedBoard,
  mergeSharedConnections,
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

const follow = (id: string, followerId = 'b'): WidgetConnection => ({
  id,
  kind: 'follow',
  leaderId: 'a',
  followerId,
});

const seq = (
  id: string,
  run: { deviceId: string; stepIndex: number } | null = null
): WidgetConnection => ({
  id,
  kind: 'sequence',
  steps: [{ id: `${id}-s`, actions: [{ widgetId: 'a', action: 'restart' }] }],
  repeat: 'once',
  ...(run && { run: { ...run, stepStartedAt: 1, loops: 0 } }),
});

const withConnections = (connections: WidgetConnection[]): Dashboard => ({
  ...board([w('a'), w('b')]),
  connections,
});

describe('mergeSharedConnections', () => {
  it('takes the share on the first snapshot, without its Runs', () => {
    const merged = mergeSharedConnections(
      withConnections([]),
      withConnections([seq('s1', { deviceId: 'host', stepIndex: 1 })]),
      undefined
    );
    expect(merged.map((c) => c.id)).toEqual(['s1']);
    expect(merged[0]).not.toHaveProperty('run');
  });

  it("a host's first snapshot keeps its own Connections a damaged share lacks", () => {
    const local = withConnections([follow('f1'), seq('s1')]);
    const server = withConnections([follow('f1')]);
    expect(
      mergeSharedConnections(local, server, undefined, true).map((c) => c.id)
    ).toEqual(['f1', 's1']);
    expect(
      mergeSharedConnections(local, server, undefined).map((c) => c.id)
    ).toEqual(['f1']);
  });

  it("takes a host's new and edited Connections when this copy has not changed", () => {
    const base = sharedBoardBaseline(withConnections([follow('f1')]));
    const merged = mergeSharedConnections(
      withConnections([follow('f1')]),
      withConnections([follow('f1', 'c'), seq('s1')]),
      base
    );
    expect(merged.map((c) => c.id)).toEqual(['f1', 's1']);
    expect(merged[0]).toMatchObject({ followerId: 'c' });
  });

  it("keeps this copy's add, edit and delete over an untouched share", () => {
    const base = sharedBoardBaseline(
      withConnections([follow('f1'), follow('f2')])
    );
    const merged = mergeSharedConnections(
      withConnections([follow('f1', 'c'), seq('mine')]),
      withConnections([follow('f1'), follow('f2')]),
      base
    );
    expect(merged.map((c) => c.id)).toEqual(['f1', 'mine']);
    expect(merged[0]).toMatchObject({ followerId: 'c' });
  });

  it('honours a co-teacher deleting a Connection this copy did not touch', () => {
    const base = sharedBoardBaseline(
      withConnections([follow('f1'), follow('f2')])
    );
    const merged = mergeSharedConnections(
      withConnections([follow('f1'), follow('f2')]),
      withConnections([follow('f2')]),
      base
    );
    expect(merged.map((c) => c.id)).toEqual(['f2']);
  });

  it("keeps this device's Run on a Sequence the share also has", () => {
    const base = sharedBoardBaseline(withConnections([seq('s1')]));
    const merged = mergeSharedConnections(
      withConnections([seq('s1', { deviceId: 'me', stepIndex: 2 })]),
      withConnections([seq('s1', { deviceId: 'host', stepIndex: 0 })]),
      base
    );
    expect(merged[0]).toMatchObject({
      run: { deviceId: 'me', stepIndex: 2 },
    });
  });

  it("a Run alone is not an edit, so a co-teacher's change still lands", () => {
    const base = sharedBoardBaseline(withConnections([seq('s1')]));
    const edited = {
      ...seq('s1'),
      repeat: 'until-done',
    } as WidgetConnection;
    const merged = mergeSharedConnections(
      withConnections([seq('s1', { deviceId: 'me', stepIndex: 1 })]),
      withConnections([edited]),
      base
    );
    expect(merged[0]).toMatchObject({
      repeat: 'until-done',
      run: { deviceId: 'me', stepIndex: 1 },
    });
  });
});

describe('mergeSharedBoard connections', () => {
  it("a collaborator with an old copy no longer wipes the host's new Connections", () => {
    let server = withConnections([]);
    const host = new Tab(server);
    const colleague = new Tab(server);

    host.local = { ...host.local, connections: [follow('f1')] };
    server = host.write(server);
    // The colleague moves a widget before the host's Connection reaches them.
    colleague.local = {
      ...colleague.local,
      widgets: [w('a', { xProp: 0.5 }), w('b')],
    };
    server = colleague.write(server);

    expect(server.connections?.map((c) => c.id)).toEqual(['f1']);
  });
});

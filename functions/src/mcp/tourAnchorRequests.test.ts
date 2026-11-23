import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  admin: true,
  reserved: 0,
  docs: new Map<string, Record<string, unknown>>(),
  openCount: 0,
  writes: [] as Array<[string, string, Record<string, unknown>]>,
}));

vi.mock('../firebaseAdmin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => 'NOW' } },
}));
vi.mock('./glTools', () => ({
  assertAccess: async () => {
    if (!h.admin) throw new (await import('./activity')).ToolError('admins');
  },
}));
vi.mock('./activity', async (orig) => ({
  ...(await orig<typeof import('./activity')>()),
  reserveWrite: () => {
    h.reserved++;
    return Promise.resolve();
  },
}));

import { ToolError } from './activity';
import {
  MAX_OPEN_REQUESTS,
  planControlRequest,
  registerAnchorRequestTools,
  requestStatus,
} from './tourAnchorRequests';
import { requestFingerprint } from './glAnchorRequests';

const ref = (path: string) => ({ path, id: path.split('/').pop() as string });
const db = {
  doc: ref,
  getAll: (...refs: Array<{ path: string; id: string }>) =>
    Promise.resolve(
      refs.map((r) => ({
        id: r.id,
        exists: h.docs.has(r.path),
        data: () => h.docs.get(r.path),
      }))
    ),
  collection: (name: string) => ({
    doc: () => ref(`${name}/auto`),
    where: () => ({
      count: () => ({
        get: () => Promise.resolve({ data: () => ({ count: h.openCount }) }),
      }),
      limit: () => ({
        get: () =>
          Promise.resolve({
            docs: [...h.docs]
              .filter(([p, d]) => p.startsWith(name) && d.requested === true)
              .map(([p, d]) => ({ id: p.split('/').pop(), data: () => d })),
          }),
      }),
    }),
  }),
  batch: () => {
    const ops: typeof h.writes = [];
    return {
      create: (r: { path: string }, d: Record<string, unknown>) =>
        ops.push(['create', r.path, d]),
      set: (r: { path: string }, d: Record<string, unknown>) =>
        ops.push(['set', r.path, d]),
      update: (r: { path: string }, d: Record<string, unknown>) =>
        ops.push(['update', r.path, d]),
      commit: () => {
        h.writes.push(...ops);
        return Promise.resolve();
      },
    };
  },
};

type Handler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ text: string }>;
}>;
const tools = new Map<string, Handler>();
registerAnchorRequestTools(
  {
    registerTool: (name: string, _def: unknown, fn: Handler) =>
      tools.set(name, fn),
  } as never,
  { db, uid: 'u', email: 'a@x.org', grantId: 'g' } as never
);
interface Body {
  queued?: number;
  controls: Array<Record<string, unknown>>;
  requests: Array<Record<string, unknown>>;
}
const call = async (name: string, args: Record<string, unknown>) => {
  const res = await tools.get(name)!(args);
  const text = res.content[0].text;
  const body = (text.startsWith('{') ? JSON.parse(text) : {}) as Body;
  return { error: res.isError === true, body };
};

const control = {
  role: 'button',
  name: 'Question bank',
  where: 'Quiz editor, beside Add question',
  widget_type: 'quiz',
};

beforeEach(() => {
  h.admin = true;
  h.reserved = 0;
  h.docs.clear();
  h.openCount = 0;
  h.writes = [];
});

describe('planControlRequest', () => {
  it('returns an existing settings anchor instead of queueing', () => {
    expect(
      planControlRequest(
        {
          role: 'switch',
          name: '24H Format',
          where: 'x',
          widget_type: 'clock',
        },
        'c'
      )
    ).toEqual({ kind: 'exists', anchor: 'settings.toggle:clock#format24' });
  });

  it('uses the same fingerprint a saved fallback step would', () => {
    const p = planControlRequest(control, 'c');
    expect(p).toMatchObject({
      kind: 'request',
      fingerprint: requestFingerprint('button', 'Question bank', 'quiz'),
      context: { requestNote: control.where, widgetType: 'quiz' },
    });
  });

  it('refuses an unknown widget or neighbour anchor', () => {
    expect(() =>
      planControlRequest({ ...control, widget_type: 'nope' }, 'c')
    ).toThrow(ToolError);
    expect(() =>
      planControlRequest({ ...control, near_anchor: 'made.up:quiz' }, 'c')
    ).toThrow(ToolError);
    expect(
      planControlRequest({ ...control, near_anchor: 'dock.item:quiz' }, 'c')
    ).toMatchObject({ context: { nearestAnchor: 'dock.item' } });
  });
});

describe('requestStatus', () => {
  it('is ready only once this build knows the anchor', () => {
    expect(requestStatus({ status: 'open' })).toEqual({ status: 'open' });
    expect(
      requestStatus({
        status: 'pr-open',
        anchorId: 'not.deployed-yet',
        prUrl: 'https://github.com/OPS-PIvers/SpartBoard/pull/1',
      })
    ).toEqual({
      status: 'pr_open',
      pr_url: 'https://github.com/OPS-PIvers/SpartBoard/pull/1',
    });
    expect(
      requestStatus({ status: 'pr-open', anchorId: 'dock.open-tools' })
    ).toEqual({ status: 'ready', anchor_ready: 'dock.open-tools' });
    expect(requestStatus({ status: 'pr-open', anchorId: 'dock.item' })).toEqual(
      {
        status: 'ready',
        anchor_ready: 'dock.item',
        needs_widget_type: true,
      }
    );
    expect(
      requestStatus({ status: 'needs-human', reason: 'in student work' })
    ).toEqual({ status: 'needs_human', reason: 'in student work' });
  });
});

describe('request_tour_anchors', () => {
  it('refuses non-admins without writing', async () => {
    h.admin = false;
    const res = await call('request_tour_anchors', { controls: [control] });
    expect(res.error).toBe(true);
    expect(h.writes).toEqual([]);
  });

  it('queues a new control and wakes the routine once', async () => {
    const res = await call('request_tour_anchors', { controls: [control] });
    const fp = requestFingerprint('button', 'Question bank', 'quiz');
    expect(res.body).toMatchObject({
      queued: 1,
      controls: [{ fingerprint: fp, status: 'open' }],
    });
    expect(h.reserved).toBe(1);
    expect(h.writes).toEqual([
      [
        'create',
        `tour_anchor_queue/${fp}`,
        expect.objectContaining({
          status: 'open',
          requested: true,
          occurrences: [],
          requestNote: control.where,
        }),
      ],
      [
        'set',
        'tour_anchor_batches/auto',
        expect.objectContaining({ fingerprints: [fp] }),
      ],
    ]);
  });

  it('reports a stored request without queueing it again', async () => {
    const fp = requestFingerprint('button', 'Question bank', 'quiz');
    h.docs.set(`tour_anchor_queue/${fp}`, {
      status: 'pr-open',
      anchorId: 'dock.open-tools',
      requested: true,
    });
    const res = await call('request_tour_anchors', { controls: [control] });
    expect(res.body.controls[0]).toMatchObject({
      status: 'ready',
      anchor_ready: 'dock.open-tools',
    });
    expect(h.writes).toEqual([]);
  });

  it('adopts a control a saved step already queued, without waking the routine', async () => {
    const fp = requestFingerprint('button', 'Question bank', 'quiz');
    h.docs.set(`tour_anchor_queue/${fp}`, {
      status: 'open',
      occurrences: [{}],
    });
    await call('request_tour_anchors', { controls: [control] });
    expect(h.writes).toEqual([
      [
        'update',
        `tour_anchor_queue/${fp}`,
        { requested: true, requestedAt: 'NOW' },
      ],
    ]);
  });

  it('stops when too many controls are already waiting', async () => {
    h.openCount = MAX_OPEN_REQUESTS;
    const res = await call('request_tour_anchors', { controls: [control] });
    expect(res.error).toBe(true);
    expect(h.writes).toEqual([]);
    expect(h.reserved).toBe(0);
  });
});

describe('list_tour_anchor_requests', () => {
  it('lists requested items newest first and filters by status', async () => {
    const at = (ms: number) => ({ toMillis: () => ms });
    h.docs.set('tour_anchor_queue/a', {
      requested: true,
      status: 'open',
      role: 'button',
      name: 'Old',
      requestedAt: at(1),
    });
    h.docs.set('tour_anchor_queue/b', {
      requested: true,
      status: 'pr-open',
      anchorId: 'dock.open-tools',
      role: 'button',
      name: 'New',
      requestedAt: at(2),
    });
    const all = await call('list_tour_anchor_requests', {});
    expect(all.body.requests.map((r) => r.name)).toEqual(['New', 'Old']);
    const ready = await call('list_tour_anchor_requests', { status: 'ready' });
    expect(ready.body.requests).toHaveLength(1);
    expect(ready.body.requests[0]).toMatchObject({
      anchor_ready: 'dock.open-tools',
    });
  });

  it('refuses non-admins', async () => {
    h.admin = false;
    expect((await call('list_tour_anchor_requests', {})).error).toBe(true);
  });
});

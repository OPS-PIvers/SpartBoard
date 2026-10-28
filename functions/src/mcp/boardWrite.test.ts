import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ToolContext } from './activity';
import { registerBoardTools } from './boardTools';
import { restoreBoard, revisionData } from './boardWrite';
import {
  BOARD_TEMPLATES,
  DEFAULT_SCREEN,
  SNAP_ZONE_LAYOUTS,
  placeInZone,
} from './boardEngine.gen';

const archive = vi.hoisted(() => ({ granted: true }));
vi.mock('../quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(() => Promise.resolve(archive.granted)),
  deriveTeacherTier: vi.fn(() => Promise.resolve('internal')),
  isBetaTeacher: vi.fn(() => Promise.resolve(false)),
  meetsMinTierServer: () => true,
}));

type Data = Record<string, unknown>;

/** In-memory Firestore with update times, preconditions, batches and transactions. */
function fakeDb(seed: Record<string, Data> = {}) {
  const docs = new Map<string, Data>(
    Object.entries(seed).map(([k, v]) => [k, structuredClone(v)])
  );
  const times = new Map<string, number>();
  let clock = 1;
  const touch = (path: string) => times.set(path, clock++);
  for (const path of docs.keys()) touch(path);
  let seq = 0;
  const failNext = { commits: 0 };
  const commits: { path: string; kind: string; data: Data }[][] = [];

  const snap = (path: string) => ({
    id: path.split('/').pop(),
    exists: docs.has(path),
    updateTime: times.get(path),
    data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
    get: (k: string) => docs.get(path)?.[k],
  });
  const docRef = (path: string) => ({
    path,
    id: path.split('/').pop(),
    get: () => Promise.resolve(snap(path)),
  });
  const collection = (path: string) => {
    const query = {
      select: () => query,
      limit: () => query,
      orderBy: () => query,
      get: () => {
        const rows = [...docs.keys()]
          .filter(
            (k) =>
              k.startsWith(`${path}/`) &&
              k.split('/').length === path.split('/').length + 1
          )
          .map(snap);
        return Promise.resolve({ docs: rows, size: rows.length });
      },
    };
    return {
      ...query,
      doc: (id?: string) => docRef(`${path}/${id ?? `auto${++seq}`}`),
    };
  };
  const apply = (
    ops: { path: string; kind: string; data: Data; merge?: boolean }[]
  ) => {
    for (const op of ops) {
      if (op.kind === 'update' || op.merge)
        docs.set(op.path, { ...(docs.get(op.path) ?? {}), ...op.data });
      else docs.set(op.path, structuredClone(op.data));
      touch(op.path);
    }
  };
  const batch = () => {
    const ops: {
      path: string;
      kind: string;
      data: Data;
      merge?: boolean;
      at?: number;
    }[] = [];
    const b = {
      set: (ref: { path: string }, data: Data, opts?: { merge?: boolean }) => {
        ops.push({ path: ref.path, kind: 'set', data, merge: opts?.merge });
        return b;
      },
      create: (ref: { path: string }, data: Data) => {
        ops.push({ path: ref.path, kind: 'create', data });
        return b;
      },
      update: (
        ref: { path: string },
        data: Data,
        pre?: { lastUpdateTime?: number }
      ) => {
        ops.push({
          path: ref.path,
          kind: 'update',
          data,
          at: pre?.lastUpdateTime,
        });
        return b;
      },
      commit: () => {
        if (failNext.commits > 0) {
          failNext.commits -= 1;
          return Promise.reject(Object.assign(new Error('stale'), { code: 9 }));
        }
        for (const op of ops) {
          if (op.kind === 'create' && docs.has(op.path))
            return Promise.reject(new Error('exists'));
          if (op.at !== undefined && times.get(op.path) !== op.at)
            return Promise.reject(
              Object.assign(new Error('stale'), { code: 9 })
            );
        }
        commits.push(
          ops.map(({ path, kind, data }) => ({
            path,
            kind,
            data: structuredClone(data),
          }))
        );
        apply(ops);
        return Promise.resolve();
      },
    };
    return b;
  };
  const db = {
    collection,
    doc: docRef,
    batch,
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const ops: { path: string; kind: string; data: Data; merge?: boolean }[] =
        [];
      const tx = {
        get: (ref: { path: string }) => Promise.resolve(snap(ref.path)),
        set: (ref: { path: string }, data: Data, o?: { merge?: boolean }) => {
          ops.push({ path: ref.path, kind: 'set', data, merge: o?.merge });
        },
      };
      const out = await fn(tx);
      apply(ops);
      return out;
    },
  };
  return { db, docs, commits, failNext, touch };
}

const ctxFor = (db: unknown): ToolContext =>
  ({ db, uid: 'u1', email: 'u1@example.org', grantId: 'g' }) as ToolContext;

async function connect(db: unknown) {
  const server = new McpServer({ name: 't', version: '1' });
  registerBoardTools(server, ctxFor(db));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'c', version: '1' });
  await client.connect(b);
  return async (name: string, args: Data = {}): Promise<Data> => {
    const res = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { type: string; text?: string }[];
    };
    const text = res.content.find((c) => c.type === 'text')?.text ?? '';
    if (res.isError) return { error: text };
    return {
      ...(JSON.parse(text) as Data),
      _images: res.content.filter((c) => c.type === 'image').length,
    };
  };
}

const zone = (layoutId: string, zoneId: string) => {
  const z = SNAP_ZONE_LAYOUTS.find((l) => l.id === layoutId)?.zones.find(
    (x) => x.id === zoneId
  );
  if (!z) throw new Error(`no zone ${layoutId}/${zoneId}`);
  return placeInZone(z, DEFAULT_SCREEN);
};

const launch = BOARD_TEMPLATES.find((t) => t.id === 'launch')!;
const BOARD = 'users/u1/dashboards/b1';
const old = Date.now() - 60 * 60 * 1000;

function seed(): Record<string, Data> {
  return {
    'users/u1/collections/c1': { name: 'Science' },
    'users/u1/dashboards/b0': { name: 'Old', order: 3, widgets: [] },
    'users/u1/quizzes/q1': { title: 'Cells quiz' },
    'users/u1/miniapps/m1': {
      title: 'Sorter',
      html: '<p>hi</p>',
      createdAt: 5,
    },
    [BOARD]: {
      name: 'Period 2',
      background: 'bg-white',
      updatedAt: old,
      order: 1,
      widgets: [
        {
          id: 'w1',
          type: 'time-tool',
          ...zone('split-half', 'left-half'),
          z: 1,
          version: 4,
          config: { duration: 300, mode: 'timer', elapsedTime: 300 },
        },
        {
          id: 'w2',
          type: 'random',
          ...zone('split-half', 'right-half'),
          z: 2,
          version: 2,
          config: { firstNames: 'Ada\nGrace', lastNames: '', mode: 'single' },
        },
        {
          id: 'w3',
          type: 'text',
          isLocked: true,
          ...zone('grid-2x2', 'top-left'),
          z: 3,
          config: { content: 'Hi', bgColor: '#fff', fontSize: 18 },
        },
      ],
    },
  };
}

const widgetsOf = (docs: Map<string, Data>, path = BOARD) =>
  (docs.get(path)?.widgets ?? []) as Data[];

describe('create_board', () => {
  beforeEach(() => {
    archive.granted = true;
  });

  it('builds a board on the template, at the top of the list, marked as made by Claude', async () => {
    const { db, docs } = fakeDb(seed());
    const call = await connect(db);
    const out = await call('create_board', {
      boards: [
        {
          name: 'Do Now',
          template_id: 'launch',
          widgets: [
            {
              type: 'text',
              zone_id: 'main',
              settings: { content: 'What is a cell?' },
            },
            {
              type: 'time-tool',
              zone_id: 'top-side',
              title: 'Warm-up',
              settings: { duration: 180 },
            },
          ],
        },
      ],
    });
    expect(out.error).toBeUndefined();
    expect(out._images).toBe(1);
    const [made] = out.boards as Data[];
    const id = String(made.board_id);
    const board = docs.get(`users/u1/dashboards/${id}`)!;
    expect(board).toMatchObject({
      name: 'Do Now',
      collectionId: null,
      claudeAction: 'created',
      claudeUnseen: true,
      background: 'bg-brand-gray-lightest',
    });
    expect(board.order).toBeLessThan(1);
    expect(board.claudeEditedAt).toBe(board.updatedAt);
    const [text, timer] = board.widgets as Data[];
    const main = launch.zones.find((z) => z.id === 'main')!;
    expect(text).toMatchObject({
      type: 'text',
      version: 1,
      configVersion: 0,
      flipped: false,
      ...placeInZone(main, DEFAULT_SCREEN),
    });
    expect((text.config as Data).content).toBe('What is a cell?');
    // Defaults fill what Claude left out.
    expect((text.config as Data).fontSize).toEqual(expect.any(Number));
    expect(timer).toMatchObject({ customTitle: 'Warm-up' });
    expect(timer.config).toMatchObject({ duration: 180, elapsedTime: 180 });
    expect(
      docs.get(`users/u1/claude_usage/${new Date().toISOString().slice(0, 10)}`)
    ).toMatchObject({ boardOps: 1 });
    const log = [...docs.entries()].filter(([k]) =>
      k.startsWith('users/u1/claude_activity/')
    );
    expect(log.map(([, v]) => v)).toEqual([
      expect.objectContaining({
        action: 'create',
        itemType: 'board',
        itemId: id,
      }),
    ]);
  });

  it('refuses the whole call and lists every problem', async () => {
    const { db, docs } = fakeDb(seed());
    const before = docs.size;
    const call = await connect(db);
    const out = await call('create_board', {
      boards: [
        {
          name: 'A',
          widgets: [
            { type: 'nope', zone_id: 'full', layout_id: 'full' },
            {
              type: 'random',
              zone_id: 'full',
              layout_id: 'full',
              settings: { firstNames: 'Ada' },
            },
          ],
        },
        { name: 'B', collection_id: 'missing', widgets: [] },
        {
          name: 'C',
          widgets: [{ type: 'time-tool', zone_id: 'left-half' }],
        },
      ],
    });
    expect(out.error).toMatch(/^Nothing was changed/);
    expect(out.error).toMatch(/"nope" is not a widget/);
    expect(out.error).toMatch(/`firstNames` is class or student data/);
    expect(out.error).toMatch(/collection missing was not found/);
    expect(out.error).toMatch(/layout_id/);
    expect(docs.size).toBe(before);
  });

  it('puts a library item on its widget and refuses ids outside the library', async () => {
    const { db, docs } = fakeDb(seed());
    const call = await connect(db);
    const ok = await call('create_board', {
      boards: [
        {
          name: 'Quiz day',
          widgets: [
            {
              type: 'quiz',
              zone_id: 'left-half',
              layout_id: 'split-half',
              library_item_id: 'q1',
            },
            {
              type: 'miniApp',
              zone_id: 'right-half',
              layout_id: 'split-half',
              library_item_id: 'm1',
            },
          ],
        },
      ],
    });
    const id = String((ok.boards as Data[])[0].board_id);
    const [quiz, app] = widgetsOf(docs, `users/u1/dashboards/${id}`);
    expect(quiz.config).toMatchObject({
      selectedQuizId: 'q1',
      selectedQuizTitle: 'Cells quiz',
      selectedQuizOwnerUid: 'u1',
    });
    expect((app.config as Data).activeApp).toMatchObject({
      id: 'm1',
      html: '<p>hi</p>',
    });
    expect(ok.notes).toEqual(
      expect.arrayContaining([expect.stringMatching(/assigns/)])
    );
    const bad = await call('create_board', {
      boards: [
        {
          name: 'X',
          widgets: [
            {
              type: 'quiz',
              zone_id: 'full',
              layout_id: 'full',
              library_item_id: 'someone-elses',
            },
            {
              type: 'quiz',
              zone_id: 'full',
              layout_id: 'full',
              settings: { selectedQuizId: 'q1' },
            },
          ],
        },
      ],
    });
    expect(bad.error).toMatch(/not in this teacher's library/);
    expect(bad.error).toMatch(/library_item_id instead of `selectedQuizId`/);
  });

  it('is hidden behind the ai-boards flag', async () => {
    archive.granted = false;
    const { db } = fakeDb(seed());
    const call = await connect(db);
    const out = await call('create_board', {
      boards: [{ name: 'A', widgets: [] }],
    });
    expect(out.error).toMatch(/not turned on/);
  });

  it('keeps boards to 20 widgets', async () => {
    const { db } = fakeDb(seed());
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: Array.from({ length: 18 }, () => ({
        op: 'add_widget',
        type: 'clock',
        zone_id: 'full',
        layout_id: 'full',
      })),
    });
    expect(out.error).toMatch(/20 widgets at most; this would make 21/);
  });
});

describe('edit_board', () => {
  beforeEach(() => {
    archive.granted = true;
  });

  it('applies batched changes, bumps versions and keeps the previous version', async () => {
    const { db, docs } = fakeDb(seed());
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [
        { op: 'update_widget', widget_id: 'w1', settings: { duration: 600 } },
        { op: 'update_widget', widget_id: 'w2', title: 'Reader' },
        {
          op: 'move_widget',
          widget_id: 'w2',
          zone_id: 'top-right',
          layout_id: 'grid-2x2',
        },
        { op: 'rename', name: 'Period 2 science' },
        { op: 'set_background', background: 'bg-white' },
        {
          op: 'add_widget',
          type: 'embed',
          zone_id: 'bottom-right',
          layout_id: 'grid-2x2',
          settings: {
            url: 'docs.google.com/presentation/d/abc/edit',
          },
        },
      ],
    });
    expect(out.error).toMatch(/w2 is changed twice/);

    const ok = await call('edit_board', {
      board_id: 'b1',
      changes: [
        { op: 'update_widget', widget_id: 'w1', settings: { duration: 600 } },
        {
          op: 'move_widget',
          widget_id: 'w2',
          zone_id: 'top-right',
          layout_id: 'grid-2x2',
        },
        { op: 'rename', name: 'Period 2 science' },
        {
          op: 'add_widget',
          type: 'embed',
          zone_id: 'bottom-right',
          layout_id: 'grid-2x2',
          settings: { url: 'docs.google.com/presentation/d/abc/edit' },
        },
      ],
    });
    expect(ok.error).toBeUndefined();
    expect(ok._images).toBe(1);
    const board = docs.get(BOARD)!;
    expect(board).toMatchObject({
      name: 'Period 2 science',
      claudeAction: 'edited',
      claudeUnseen: true,
    });
    expect(board.updatedAt).toBeGreaterThan(old);
    const [w1, w2, w3, embed] = board.widgets as Data[];
    expect(w1).toMatchObject({ version: 5 });
    expect(w1.config).toEqual({
      duration: 600,
      mode: 'timer',
      elapsedTime: 600,
      isRunning: false,
      startTime: null,
    });
    expect(w2).toMatchObject({ version: 3, ...zone('grid-2x2', 'top-right') });
    // Class data Claude never saw is left exactly as it was.
    expect((w2.config as Data).firstNames).toBe('Ada\nGrace');
    expect(w3).toEqual((seed()[BOARD].widgets as Data[])[2]);
    expect(embed.config).toMatchObject({
      url: 'https://docs.google.com/presentation/d/abc/edit',
      isEmbeddable: true,
    });
    expect(ok.notes).toEqual(
      expect.arrayContaining([expect.stringMatching(/view access/)])
    );
    const revisions = [...docs.entries()].filter(([k]) =>
      k.startsWith('users/u1/claude_revisions/')
    );
    expect(revisions).toHaveLength(1);
    const [revPath, rev] = revisions[0];
    expect(rev).toMatchObject({ itemType: 'board', itemId: 'b1' });
    expect((rev.data as Data).name).toBe('Period 2');
    expect(ok.previous_version_revision_id).toBe(revPath.split('/').pop());
  });

  it('refuses locked widgets, placeholders and class teams without changing anything', async () => {
    const s = seed();
    (s[BOARD].widgets as Data[]).push({
      id: 'w4',
      type: 'scoreboard',
      ...zone('grid-2x2', 'bottom-left'),
      z: 4,
      config: { teams: [{ id: 't', name: 'Ada', memberStudentIds: ['s1'] }] },
    });
    const { db, docs, commits } = fakeDb(s);
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [
        { op: 'remove_widget', widget_id: 'w3' },
        {
          op: 'update_widget',
          widget_id: 'w1',
          settings: { mode: 'x… (900 characters)' },
        },
        {
          op: 'update_widget',
          widget_id: 'w4',
          settings: { teams: [{ id: 't', name: '[class group]' }] },
        },
        {
          op: 'move_widget',
          widget_id: 'missing',
          zone_id: 'full',
          layout_id: 'full',
        },
      ],
    });
    expect(out.error).toMatch(/Change 1 \(remove_widget\): .*locked/);
    expect(out.error).toMatch(/Change 2 .*placeholder/);
    expect(out.error).toMatch(/Change 3 .*placeholder|Change 3 .*class/);
    expect(out.error).toMatch(/Change 4 .*not on this board/);
    expect(commits).toHaveLength(0);
    expect(docs.get(BOARD)).toEqual(s[BOARD]);
  });

  it('retries when SpartBoard saves the board in between', async () => {
    const { db, docs, failNext } = fakeDb(seed());
    failNext.commits = 1;
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [{ op: 'rename', name: 'Again' }],
    });
    expect(out.error).toBeUndefined();
    expect(docs.get(BOARD)?.name).toBe('Again');
  });

  it("refuses boards another teacher shares into this teacher's list", async () => {
    const s = seed();
    s[BOARD] = { ...s[BOARD], linkedShareId: 'sh', linkedShareRole: 'editor' };
    s['users/u1/dashboards/b2'] = {
      name: 'Viewer copy',
      linkedShareId: 'sh2',
      linkedShareRole: 'viewer',
      linkedShareEnded: true,
      widgets: [],
    };
    s['users/u1/dashboards/b3'] = {
      name: 'Guest copy',
      linkedShareId: 'sh3',
      linkedShareRole: 'collaborator',
      linkedShareHostUid: 'u2',
      linkedShareEnded: true,
      widgets: [],
    };
    s['shared_boards/sh3'] = { originalAuthor: 'u2', widgets: [] };
    const { db, docs } = fakeDb(s);
    const call = await connect(db);
    const rename = (board_id: string) =>
      call('edit_board', { board_id, changes: [{ op: 'rename', name: 'X' }] });
    for (const id of ['b1', 'b2', 'b3'])
      expect((await rename(id)).error).toMatch(
        /Another teacher owns this board/
      );
    // Once the share is gone the guest's copy is theirs.
    docs.delete('shared_boards/sh3');
    expect((await rename('b3')).error).toBeUndefined();
    expect(docs.get('users/u1/dashboards/b3')?.name).toBe('X');
  });

  it("starts from a live share's content and mirrors the change to co-teachers, scrubbed", async () => {
    const s = seed();
    const own = s[BOARD].widgets as Data[];
    s[BOARD] = {
      ...s[BOARD],
      linkedShareId: 'sh',
      linkedShareRole: 'owner',
      linkedShareEnded: false,
      widgets: own.map((w, i) =>
        i === 0 ? { ...w, lastUse: { uid: 'u1', at: 1 } } : w
      ),
    };
    const coTeacherNote = {
      id: 'wc',
      type: 'text',
      ...zone('grid-2x2', 'bottom-right'),
      z: 4,
      version: 1,
      config: { content: 'From a co-teacher', bgColor: '#fff', fontSize: 18 },
    };
    s['shared_boards/sh'] = {
      originalAuthor: 'u1',
      intendedMode: 'synced',
      participants: { u2: { role: 'collaborator' } },
      name: 'Period 2',
      background: 'bg-slate-100',
      updatedAt: old,
      updatedBy: 'u2',
      globalStyle: { fontFamily: 'serif' },
      annotationOverlay: { objects: [{ id: 'ink1' }], canvasWidth: 1600 },
      widgets: [
        {
          ...own[0],
          version: 6,
          config: { ...(own[0].config as Data), duration: 120 },
        },
        { ...own[1], config: { lastNames: '', mode: 'single' } },
        own[2],
        coTeacherNote,
      ],
    };
    const { db, docs } = fakeDb(s);
    const call = await connect(db);

    const read = await call('get_board', { board_id: 'b1' });
    expect((read.widgets as Data[]).map((w) => w.widget_id)).toContain('wc');

    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [
        { op: 'update_widget', widget_id: 'w1', title: 'Warm-up' },
        { op: 'rename', name: 'Period 2 (Tue)' },
      ],
    });
    expect(out.error).toBeUndefined();
    expect(out.notes).toContain(
      'This board is shared live, so the teachers it is shared with see the change too.'
    );

    const share = docs.get('shared_boards/sh')!;
    const shared = share.widgets as Data[];
    expect(shared.map((w) => w.id)).toEqual(['w1', 'w2', 'w3', 'wc']);
    // The co-teacher's timer length survives; Claude's title lands on top.
    expect(shared[0]).toMatchObject({ customTitle: 'Warm-up', version: 7 });
    expect((shared[0].config as Data).duration).toBe(120);
    expect(shared[0].lastUse).toBeUndefined();
    // Student names never reach the share.
    expect(JSON.stringify(share)).not.toMatch(/Ada|Grace/);
    expect(share).toMatchObject({
      name: 'Period 2 (Tue)',
      background: 'bg-slate-100',
      updatedBy: 'u1',
      originalAuthor: 'u1',
      participants: { u2: { role: 'collaborator' } },
    });
    expect(Number(share.updatedAt)).toBeGreaterThan(old);

    const board = docs.get(BOARD)!;
    const widgets = board.widgets as Data[];
    expect(widgets.map((w) => w.id)).toEqual(['w1', 'w2', 'w3', 'wc']);
    expect(widgets[0].lastUse).toEqual({ uid: 'u1', at: 1 });
    expect((widgets[1].config as Data).firstNames).toBe('Ada\nGrace');
    expect(board.background).toBe('bg-slate-100');
    // The share now says this teacher wrote it last, so their board carries the co-teacher's style and ink.
    expect(board.globalStyle).toEqual({ fontFamily: 'serif' });
    expect(board.annotationOverlay).toEqual({
      objects: [{ id: 'ink1' }],
      canvasWidth: 1600,
    });
    expect(board.linkedShareId).toBe('sh');
  });

  it('renames the board in the synced collection it belongs to', async () => {
    const s = seed();
    s[BOARD] = {
      ...s[BOARD],
      collectionId: 'c3',
      linkedShareId: 'L1_b1',
      linkedShareRole: 'owner',
    };
    s['users/u1/collections/c2'] = {
      name: 'Shared unit',
      linkedCollectionId: 'L1',
      linkedCollectionRole: 'owner',
    };
    s['users/u1/collections/c3'] = { name: 'Week 1', parentCollectionId: 'c2' };
    s['shared_boards/L1_b1'] = {
      originalAuthor: 'u1',
      intendedMode: 'synced',
      linkedCollectionId: 'L1',
      widgets: s[BOARD].widgets,
    };
    s['linked_collections/L1'] = {
      hostUid: 'u1',
      mode: 'synced',
      participants: { u2: { role: 'collaborator', joinedAt: 1 } },
      boards: [
        { shareId: 'L1_other', name: 'Other', order: 0 },
        { shareId: 'L1_b1', name: 'Period 2', order: 1, sectionId: 'c3' },
      ],
    };
    const { db, docs } = fakeDb(s);
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [{ op: 'rename', name: 'Lab day' }],
    });
    expect(out.error).toBeUndefined();
    expect(docs.get('linked_collections/L1')?.boards).toEqual([
      { shareId: 'L1_other', name: 'Other', order: 0 },
      { shareId: 'L1_b1', name: 'Lab day', order: 1, sectionId: 'c3' },
    ]);
    expect(docs.get('shared_boards/L1_b1')?.name).toBe('Lab day');
  });

  it("writes only the teacher's board when its share is gone or belongs to someone else", async () => {
    const s = seed();
    s[BOARD] = { ...s[BOARD], linkedShareId: 'sh', linkedShareRole: 'owner' };
    s['users/u1/dashboards/b2'] = {
      name: 'Retaken',
      linkedShareId: 'sh2',
      linkedShareRole: 'owner',
      widgets: [],
    };
    s['shared_boards/sh2'] = { originalAuthor: 'u9', widgets: [] };
    const { db, docs } = fakeDb(s);
    const call = await connect(db);
    for (const board_id of ['b1', 'b2'])
      expect(
        (
          await call('edit_board', {
            board_id,
            changes: [{ op: 'rename', name: 'New' }],
          })
        ).error
      ).toBeUndefined();
    expect(docs.has('shared_boards/sh')).toBe(false);
    expect(docs.get('shared_boards/sh2')).toEqual({
      originalAuthor: 'u9',
      widgets: [],
    });
  });

  it('retries when a co-teacher saves the share in between', async () => {
    const s = seed();
    s[BOARD] = { ...s[BOARD], linkedShareId: 'sh', linkedShareRole: 'owner' };
    s['shared_boards/sh'] = {
      originalAuthor: 'u1',
      widgets: s[BOARD].widgets,
    };
    const { db, docs, touch } = fakeDb(s);
    const original = db.doc;
    let reads = 0;
    db.doc = (path: string) => {
      const ref = original(path);
      if (path !== 'shared_boards/sh') return ref;
      return {
        ...ref,
        get: async () => {
          const snap = await ref.get();
          // The first read goes stale before the write.
          if (++reads === 1) touch(path);
          return snap;
        },
      };
    };
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [{ op: 'rename', name: 'Again' }],
    });
    expect(out.error).toBeUndefined();
    expect(reads).toBe(2);
    expect(docs.get('shared_boards/sh')?.name).toBe('Again');
  });

  it('keeps nested student state Claude never saw when it edits a list', async () => {
    const s = seed();
    (s[BOARD].widgets as Data[]).push(
      {
        id: 'c1',
        type: 'checklist',
        ...zone('grid-2x2', 'bottom-left'),
        z: 5,
        config: {
          items: [
            { id: 'i1', text: 'Read', completed: true },
            { id: 'i2', text: 'Write', completed: false },
          ],
        },
      },
      {
        id: 'p1',
        type: 'poll',
        ...zone('grid-2x2', 'bottom-right'),
        z: 6,
        config: {
          question: 'Pick',
          options: [{ id: 'o1', label: 'A', votes: 7 }],
        },
      }
    );
    const { db, docs } = fakeDb(s);
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [
        {
          op: 'update_widget',
          widget_id: 'c1',
          settings: {
            items: [
              { id: 'i1', text: 'Read chapter 2' },
              { id: 'i2', text: 'Write', completed: true },
              { text: 'Share' },
            ],
          },
        },
        {
          op: 'update_widget',
          widget_id: 'p1',
          settings: {
            options: [
              { id: 'o1', label: 'Apples', votes: 0 },
              { id: 'o2', label: 'Pears' },
            ],
          },
        },
      ],
    });
    expect(out.error).toBeUndefined();
    const widgets = widgetsOf(docs);
    const items = (widgets[3].config as Data).items as Data[];
    expect(items[0]).toMatchObject({ text: 'Read chapter 2', completed: true });
    expect(items[1]).toMatchObject({ completed: false });
    expect(items[2]).toMatchObject({ text: 'Share', completed: false });
    const options = (widgets[4].config as Data).options as Data[];
    expect(options[0]).toMatchObject({ label: 'Apples', votes: 7 });
    expect(options[1]).toMatchObject({ label: 'Pears', votes: 0 });
  });

  it('refuses to replace a list longer than get_board shows', async () => {
    const s = seed();
    (s[BOARD].widgets as Data[]).push({
      id: 'c1',
      type: 'checklist',
      ...zone('grid-2x2', 'bottom-left'),
      z: 5,
      config: {
        items: Array.from({ length: 25 }, (_, i) => ({
          id: `i${i}`,
          text: `Item ${i}`,
          completed: false,
        })),
      },
    });
    const { db } = fakeDb(s);
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [
        {
          op: 'update_widget',
          widget_id: 'c1',
          settings: { items: [{ id: 'i0', text: 'Only one' }] },
        },
      ],
    });
    expect(out.error).toMatch(/`items` holds more than get_board shows/);
  });

  it('bumps a legacy widget with no version above the version the app assumes', async () => {
    const { db, docs } = fakeDb(seed());
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [
        { op: 'update_widget', widget_id: 'w3', settings: { content: 'Bye' } },
      ],
    });
    expect(out.error).toBeUndefined();
    expect(widgetsOf(docs)[2].version).toBe(2);
  });

  it('refuses to replace a long text it only showed in part', async () => {
    const s = seed();
    const w3 = (s[BOARD].widgets as Data[])[2];
    w3.config = { ...(w3.config as Data), content: 'x'.repeat(1200) };
    const { db } = fakeDb(s);
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [
        {
          op: 'update_widget',
          widget_id: 'w3',
          settings: { content: 'short' },
        },
      ],
    });
    expect(out.error).toMatch(/`content` is longer than get_board shows/);
  });

  it('opens a new quiz in the library instead of the old live assignment', async () => {
    const s = seed();
    (s[BOARD].widgets as Data[]).push({
      id: 'q',
      type: 'quiz',
      ...zone('grid-2x2', 'bottom-left'),
      z: 5,
      config: {
        view: 'monitor',
        selectedQuizId: 'old',
        activeAssignmentId: 'a1',
        activeLiveSessionCode: 'ABC',
      },
    });
    const { db, docs } = fakeDb(s);
    const call = await connect(db);
    const live = await call('edit_board', {
      board_id: 'b1',
      changes: [
        { op: 'update_widget', widget_id: 'q', library_item_id: 'old' },
      ],
    });
    // The quiz already on the widget stays live; only a different quiz resets it.
    expect(live.error).toBeUndefined();
    expect(widgetsOf(docs)[3].config).toMatchObject({ view: 'monitor' });
    await call('edit_board', {
      board_id: 'b1',
      changes: [{ op: 'update_widget', widget_id: 'q', library_item_id: 'q1' }],
    });
    expect(widgetsOf(docs)[3].config).toMatchObject({
      view: 'manager',
      selectedQuizId: 'q1',
      activeAssignmentId: null,
      activeLiveSessionCode: null,
    });
  });

  it('moves widgets onto a template and later adds default to its zones', async () => {
    const { db, docs } = fakeDb(seed());
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [
        {
          op: 'apply_template',
          template_id: 'launch',
          widgets: [{ widget_id: 'w1', zone_id: 'top-side' }],
        },
        { op: 'add_widget', type: 'text', zone_id: 'main' },
      ],
    });
    expect(out.error).toBeUndefined();
    const widgets = widgetsOf(docs);
    const side = launch.zones.find((z) => z.id === 'top-side')!;
    const main = launch.zones.find((z) => z.id === 'main')!;
    expect(widgets[0]).toMatchObject(placeInZone(side, DEFAULT_SCREEN));
    expect(widgets[3]).toMatchObject(placeInZone(main, DEFAULT_SCREEN));
  });

  it('stops at the daily board allowance', async () => {
    const s = seed();
    s[`users/u1/claude_usage/${new Date().toISOString().slice(0, 10)}`] = {
      boardOps: 500,
      writes: 0,
    };
    const { db } = fakeDb(s);
    const call = await connect(db);
    const out = await call('edit_board', {
      board_id: 'b1',
      changes: [{ op: 'rename', name: 'X' }],
    });
    expect(out.error).toMatch(/500 Claude board changes/);
  });
});

describe('board revisions', () => {
  it('restores widgets with versions that outrank the open tab, keeping live sharing as it is', async () => {
    const { db, docs } = fakeDb(seed());
    const call = await connect(db);
    const edit = await call('edit_board', {
      board_id: 'b1',
      changes: [
        { op: 'remove_widget', widget_id: 'w2' },
        { op: 'rename', name: 'Changed' },
      ],
    });
    const revId = String(edit.previous_version_revision_id);
    docs.set(BOARD, {
      ...docs.get(BOARD)!,
      isPinned: true,
      widgets: [
        ...widgetsOf(docs),
        {
          ...(seed()[BOARD].widgets as Data[])[1],
          config: {
            firstNames: 'Ada\nGrace\nLin',
            lastNames: '',
            mode: 'single',
          },
        },
      ],
    });
    const rev = await db.doc(`users/u1/claude_revisions/${revId}`).get();
    const restored = await restoreBoard(
      ctxFor(db),
      rev as unknown as Parameters<typeof restoreBoard>[1]
    );
    const board = docs.get(BOARD)!;
    expect(board.name).toBe('Period 2');
    expect(board.isPinned).toBe(true);
    const widgets = board.widgets as Data[];
    expect(widgets.map((w) => w.id)).toEqual(['w1', 'w2', 'w3']);
    expect(widgets[0].version).toBe(5);
    expect(widgets[1].version).toBe(3);
    // Class data recorded since the revision stays as it is now.
    expect((widgets[1].config as Data).firstNames).toBe('Ada\nGrace\nLin');
    expect(restored.changes).toEqual([
      'Restored the board to the saved version.',
    ]);
  });

  it('restores a live-shared board for co-teachers too', async () => {
    const s = seed();
    s[BOARD] = { ...s[BOARD], linkedShareId: 'sh', linkedShareRole: 'owner' };
    s['shared_boards/sh'] = {
      originalAuthor: 'u1',
      intendedMode: 'view-only',
      name: 'Period 2',
      widgets: s[BOARD].widgets,
    };
    const { db, docs } = fakeDb(s);
    const call = await connect(db);
    const edit = await call('edit_board', {
      board_id: 'b1',
      changes: [{ op: 'remove_widget', widget_id: 'w1' }],
    });
    expect(
      (docs.get('shared_boards/sh')?.widgets as Data[]).map((w) => w.id)
    ).toEqual(['w2', 'w3']);
    const rev = await db
      .doc(
        `users/u1/claude_revisions/${String(edit.previous_version_revision_id)}`
      )
      .get();
    await restoreBoard(
      ctxFor(db),
      rev as unknown as Parameters<typeof restoreBoard>[1]
    );
    const shared = docs.get('shared_boards/sh')?.widgets as Data[];
    expect(shared.map((w) => w.id)).toEqual(['w1', 'w2', 'w3']);
    expect(JSON.stringify(shared)).not.toMatch(/Ada|Grace/);
  });

  it('leaves legacy inline ink out of a revision near the size cap', () => {
    const big = 'x'.repeat(950_000);
    const { data, inkLeftOut } = revisionData({
      id: 'b',
      widgets: [{ id: 'd', type: 'drawing', config: { paths: [big] } }],
    });
    expect(inkLeftOut).toBe(true);
    expect(data.claudeInkLeftOut).toBe(true);
    expect(data.id).toBeUndefined();
    expect((data.widgets as Data[])[0].config).toEqual({});
  });
});

describe('tidy_board', () => {
  const messy = (): Record<string, Data> => {
    const s = seed();
    const at = (x: number, y: number, w: number, h: number) => ({
      xProp: x,
      yProp: y,
      wProp: w,
      hProp: h,
    });
    s[BOARD] = {
      ...s[BOARD],
      widgets: [
        {
          id: 'w1',
          type: 'time-tool',
          ...at(0.03, 0.05, 0.4, 0.5),
          z: 1,
          version: 4,
          config: { duration: 300, mode: 'timer', elapsedTime: 300 },
        },
        {
          id: 'w2',
          type: 'text',
          ...at(0.47, 0.1, 0.45, 0.6),
          z: 2,
          config: { content: 'Do now', bgColor: '#fef', fontSize: 22 },
        },
        {
          id: 'w3',
          type: 'text',
          isLocked: true,
          ...at(0.1, 0.7, 0.2, 0.2),
          z: 3,
          version: 2,
          config: { content: 'Locked', bgColor: '#fff', fontSize: 18 },
        },
        {
          id: 'w4',
          type: 'clock',
          minimized: true,
          ...at(0.9, 0.9, 0.05, 0.05),
          z: 4,
          config: {},
        },
      ],
    };
    return s;
  };

  it('moves widgets onto snap zones and leaves every setting byte-identical', async () => {
    const s = messy();
    const { db, docs } = fakeDb(s);
    const call = await connect(db);
    const out = await call('tidy_board', { board_id: 'b1' });
    expect(out.error).toBeUndefined();
    expect(out._images).toBe(1);
    expect(out.previous_version_revision_id).toEqual(expect.any(String));
    expect(out.notes).toEqual([
      '1 locked or pinned widget stayed where the teacher put it.',
    ]);
    const before = s[BOARD].widgets as Data[];
    const after = widgetsOf(docs);
    expect(after.map((w) => JSON.stringify(w.config))).toEqual(
      before.map((w) => JSON.stringify(w.config))
    );
    // Only positions change, and only on widgets that moved.
    const strip = (w: Data) => {
      const rest: Data = { ...w };
      for (const k of [
        'x',
        'y',
        'w',
        'h',
        'xProp',
        'yProp',
        'wProp',
        'hProp',
        'aspectRatio',
        'version',
      ])
        delete rest[k];
      return rest;
    };
    expect(after.map(strip)).toEqual(before.map(strip));
    expect(after[0].version).toBe(5);
    expect(after[1].version).toBe(2);
    expect(after[2]).toEqual(before[2]);
    expect(after[3]).toEqual(before[3]);
    expect(after[0].xProp).not.toBe(before[0].xProp);
    expect(docs.get(BOARD)).toMatchObject({
      claudeAction: 'edited',
      claudeUnseen: true,
    });
  });

  it('changes nothing on a board that is already tidy', async () => {
    const { db, docs, commits } = fakeDb(messy());
    const call = await connect(db);
    await call('tidy_board', { board_id: 'b1' });
    const saved = structuredClone(docs.get(BOARD));
    const count = commits.length;
    const again = await call('tidy_board', { board_id: 'b1' });
    expect(again.error).toBeUndefined();
    expect(again.changes).toEqual([
      'The board was already tidy, so nothing was changed.',
    ]);
    expect(again.previous_version_revision_id).toBeUndefined();
    expect(commits.length).toBe(count);
    expect(docs.get(BOARD)).toEqual(saved);
  });

  it('tidies a live-shared board for co-teachers too', async () => {
    const s = messy();
    s[BOARD] = { ...s[BOARD], linkedShareId: 'sh', linkedShareRole: 'owner' };
    s['shared_boards/sh'] = {
      originalAuthor: 'u1',
      intendedMode: 'synced',
      widgets: s[BOARD].widgets,
    };
    const { db, docs } = fakeDb(s);
    const call = await connect(db);
    await call('tidy_board', { board_id: 'b1' });
    const shared = docs.get('shared_boards/sh')?.widgets as Data[];
    expect(shared.map((w) => w.xProp)).toEqual(
      widgetsOf(docs).map((w) => w.xProp)
    );
  });

  it('is hidden behind the ai-boards flag', async () => {
    archive.granted = false;
    const { db } = fakeDb(messy());
    const call = await connect(db);
    expect((await call('tidy_board', { board_id: 'b1' })).error).toMatch(
      /not turned on/
    );
    archive.granted = true;
  });
});

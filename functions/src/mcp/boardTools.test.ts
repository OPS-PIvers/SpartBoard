import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ToolContext } from './activity';
import { registerBoardTools } from './boardTools';
import {
  inUseNote,
  summarizeSettings,
  zoneOf,
  IN_USE_WINDOW_MS,
} from './boardStore';
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

function fakeDb(seed: Record<string, Data> = {}) {
  const docs = new Map(Object.entries(seed));
  const reads: string[] = [];
  const snap = (path: string) => ({
    id: path.split('/').pop(),
    exists: docs.has(path),
    data: () => docs.get(path),
    get: (k: string) => docs.get(path)?.[k],
  });
  const docRef = (path: string) => ({
    path,
    id: path.split('/').pop(),
    get: () => {
      reads.push(path);
      return Promise.resolve(snap(path));
    },
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
    return { ...query, doc: (id: string) => docRef(`${path}/${id}`) };
  };
  const db = {
    collection,
    doc: docRef,
    getAll: (...args: unknown[]) =>
      Promise.resolve(
        args
          .filter((a): a is { path: string } => !!(a as Data)?.path)
          .map((ref) => snap(ref.path))
      ),
  };
  return { db, docs, reads };
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
      content: { type: string; text?: string; mimeType?: string }[];
    };
    const text = res.content.find((c) => c.type === 'text')?.text ?? '';
    const image = res.content.find((c) => c.type === 'image');
    const out: Data = res.isError
      ? { error: text }
      : { ...(JSON.parse(text) as Data), _image: image?.mimeType ?? null };
    return out;
  };
}

const placed = (where: unknown) => {
  const { layout_id, zone_id } = where as {
    layout_id: string;
    zone_id: string;
  };
  const z = SNAP_ZONE_LAYOUTS.find((l) => l.id === layout_id)?.zones.find(
    (x) => x.id === zone_id
  );
  if (!z) throw new Error(`no zone ${layout_id}/${zone_id}`);
  return placeInZone(z, DEFAULT_SCREEN);
};

const now = Date.now();
const template = BOARD_TEMPLATES[0];
const [z0, z1] = template.zones.map((z) => placeInZone(z, DEFAULT_SCREEN));

function seed(): Record<string, Data> {
  return {
    'users/u1/collections/c1': { name: 'Science', parentCollectionId: null },
    'users/u1/collections/c2': { name: 'Unit 3', parentCollectionId: 'c1' },
    'users/u1/dashboards/b1': {
      name: 'Period 2',
      updatedAt: now - 60 * 60 * 1000,
      collectionId: 'c2',
      widgets: [
        {
          id: 'w1',
          type: 'time-tool',
          ...z0,
          config: { duration: 300, mode: 'timer' },
        },
        {
          id: 'w2',
          type: 'random',
          customTitle: 'Pick a reader',
          ...z1,
          config: {
            firstNames: 'Ada\nGrace',
            lastResult: 'Ada',
            remainingStudents: ['Grace'],
            rosterMode: 'class',
            mode: 'single',
          },
        },
        {
          id: 'w3',
          type: 'quiz',
          ...z1,
          config: { selectedQuizId: 'quiz-9', activeAssignmentId: 'a1' },
        },
      ],
    },
    'users/u1/dashboards/b2': {
      name: 'Morning',
      updatedAt: now - 60 * 1000,
      widgets: [],
    },
    'users/u1/dashboards/b3': {
      name: 'Old',
      createdAt: now - 10 * 24 * 60 * 60 * 1000,
      widgets: [{ id: 'x', type: 'clock', config: {} }],
    },
    'users/u2/dashboards/secret': { name: 'Not mine', widgets: [] },
  };
}

beforeEach(() => {
  archive.granted = true;
});

describe('list_boards', () => {
  it("lists the teacher's boards newest first with collection paths and counts", async () => {
    const call = await connect(fakeDb(seed()).db);
    const res = (await call('list_boards')) as { boards: Data[] };
    expect(res.boards.map((b) => b.name)).toEqual([
      'Morning',
      'Period 2',
      'Old',
    ]);
    const p2 = res.boards[1];
    expect(p2).toMatchObject({
      board_id: 'b1',
      widget_count: 3,
      collection: 'Science / Unit 3',
      in_use: false,
    });
    expect(res.boards[0].in_use).toBe(true);
    expect(res.boards.some((b) => b.name === 'Not mine')).toBe(false);
  });

  it('filters by name and by collection', async () => {
    const call = await connect(fakeDb(seed()).db);
    const byName = (await call('list_boards', { search: 'period' })) as {
      boards: Data[];
    };
    expect(byName.boards.map((b) => b.board_id)).toEqual(['b1']);
    const root = (await call('list_boards', { collection_id: 'root' })) as {
      boards: Data[];
    };
    expect(root.boards.map((b) => b.board_id)).toEqual(['b2', 'b3']);
  });

  it('pages with next_cursor', async () => {
    const many: Record<string, Data> = {};
    for (let i = 0; i < 30; i++)
      many[`users/u1/dashboards/b${i}`] = {
        name: `B${i}`,
        updatedAt: i,
        widgets: [],
      };
    const call = await connect(fakeDb(many).db);
    const first = (await call('list_boards')) as {
      boards: Data[];
      next_cursor: string;
    };
    expect(first.boards).toHaveLength(25);
    const second = (await call('list_boards', {
      cursor: first.next_cursor,
    })) as { boards: Data[]; next_cursor: string | null };
    expect(second.boards).toHaveLength(5);
    expect(second.next_cursor).toBeNull();
  });

  it('refuses when ai-boards is off for the teacher', async () => {
    archive.granted = false;
    const call = await connect(fakeDb(seed()).db);
    expect(await call('list_boards')).toEqual({
      error: 'Boards through Claude are not turned on for this account yet.',
    });
  });
});

describe('get_board', () => {
  it('returns widgets, zones, library items, a layout check and a picture', async () => {
    const call = await connect(fakeDb(seed()).db);
    const res = (await call('get_board', { board_id: 'b1' })) as Data & {
      widgets: Data[];
      layout_check: string[];
    };
    expect(res._image).toBe('image/png');
    expect(res.screen).toMatchObject({ w: 1920, h: 1080 });
    expect(res.collection).toBe('Science / Unit 3');
    const [timer, picker, quiz] = res.widgets;
    expect(timer).toMatchObject({
      type: 'time-tool',
      name: 'Timer',
      settings: { duration: 300, mode: 'timer' },
    });
    expect(placed(timer.zone)).toEqual(z0);
    expect(picker.settings).toEqual({ mode: 'single' });
    expect(quiz.library_item).toEqual({ kind: 'quiz', id: 'quiz-9' });
    expect(JSON.stringify(quiz.settings)).not.toContain('a1');
    expect(picker.title).toBe('Pick a reader');
    expect(res.layout_check.join(' ')).toContain('overlaps');
  });

  it('never returns student names, even from a stale board doc', async () => {
    const call = await connect(fakeDb(seed()).db);
    const text = JSON.stringify(await call('get_board', { board_id: 'b1' }));
    for (const name of ['Ada', 'Grace']) expect(text).not.toContain(name);
  });

  it("uses the teacher's recorded screen, and a requested one over it", async () => {
    const data = seed();
    data['users/u1/userProfile/profile'] = {
      boardScreen: { w: 1024, h: 768, at: now },
    };
    const call = await connect(fakeDb(data).db);
    const recorded = await call('get_board', { board_id: 'b2' });
    expect(recorded.screen).toMatchObject({ w: 1024, h: 768 });
    const asked = await call('get_board', {
      board_id: 'b2',
      screen: { w: 2560, h: 1080 },
    });
    expect(asked.screen).toMatchObject({ w: 2560, h: 1080 });
  });

  it('warns when the board was just changed in SpartBoard', async () => {
    const call = await connect(fakeDb(seed()).db);
    const res = await call('get_board', { board_id: 'b2' });
    expect(String(res.in_use)).toContain('may be on screen');
  });

  it('only reads boards under the teacher, and rejects path-like ids', async () => {
    const { db, reads } = fakeDb(seed());
    const call = await connect(db);
    expect(await call('get_board', { board_id: 'secret' })).toEqual({
      error: 'Board secret was not found.',
    });
    expect(
      await call('get_board', { board_id: 'b1/drawings/w1' })
    ).toHaveProperty('error');
    expect(await call('get_board', { board_id: '..' })).toHaveProperty('error');
    expect(reads.every((p) => p.startsWith('users/u1/'))).toBe(true);
  });

  it('is refused when ai-boards is off', async () => {
    archive.granted = false;
    const call = await connect(fakeDb(seed()).db);
    expect(await call('get_board', { board_id: 'b1' })).toHaveProperty('error');
  });
});

describe('get_board_guide', () => {
  it('serves templates, widgets with settings, questions and notes', async () => {
    const call = await connect(fakeDb(seed()).db);
    const guide = (await call('get_board_guide', {
      widget_types: ['time-tool', 'stations', 'not-a-widget'],
    })) as Data & {
      templates: Data[];
      widgets: Data[];
      widget_details: Record<string, Data>;
      notes: string[];
      not_available: string[];
    };
    expect(guide.templates).toHaveLength(BOARD_TEMPLATES.length);
    const timer = guide.widgets.find((w) => w.type === 'time-tool');
    expect(timer).toMatchObject({ name: 'Timer' });
    expect(guide.widgets.find((w) => w.type === 'quiz')).toMatchObject({
      library_item: { kind: 'quiz', setting: 'selectedQuizId' },
    });
    expect(guide.widget_details['time-tool'].settings_schema).toHaveProperty(
      'properties.duration'
    );
    expect(guide.not_available).toHaveLength(1);
    const stations = JSON.stringify(guide.widget_details.stations);
    for (const key of ['customRoster', 'assignments', 'rosterMode'])
      expect(stations).not.toContain(`"${key}"`);
    expect(guide.notes.join(' ')).toContain('view access');
    expect(JSON.stringify(guide).length).toBeLessThan(120_000);
  });

  it('leaves out widgets the district turned off', async () => {
    const data = seed();
    data['feature_permissions/time-tool'] = {
      widgetType: 'time-tool',
      enabled: false,
      accessLevel: 'public',
    };
    const call = await connect(fakeDb(data).db);
    const guide = (await call('get_board_guide')) as { widgets: Data[] };
    expect(guide.widgets.some((w) => w.type === 'time-tool')).toBe(false);
  });
});

describe('board helpers', () => {
  it('summarizes settings without student or class state', () => {
    expect(
      summarizeSettings('random', {
        firstNames: 'Ada',
        rosterMode: 'class',
        lastResult: 'Ada',
        mode: 'single',
        notAKey: 1,
      })
    ).toEqual({ mode: 'single' });
    expect(
      summarizeSettings('text', { content: 'x'.repeat(5000) }).content
    ).toMatch(/… \(5000 characters\)$/);
    expect(
      summarizeSettings('text', { content: 'data:image/png;base64,AAAA' })
    ).toEqual({ content: '[embedded file]' });
  });

  it('finds the zone a widget sits on and none for a hand-placed one', () => {
    for (const layout of SNAP_ZONE_LAYOUTS)
      for (const z of layout.zones) {
        const r = placeInZone(z, DEFAULT_SCREEN);
        expect(placed(zoneOf(r, DEFAULT_SCREEN))).toEqual(r);
      }
    expect(zoneOf({ x: 500, y: 300, w: 211, h: 97 }, DEFAULT_SCREEN)).toBe(
      null
    );
  });

  it('reports in use only for recent edits Claude did not make', () => {
    const t = 1_000_000_000;
    expect(inUseNote({ updatedAt: t - 1000 }, t)).toContain('1 minute');
    expect(inUseNote({ updatedAt: t - IN_USE_WINDOW_MS - 1 }, t)).toBeNull();
    expect(
      inUseNote({ updatedAt: t - 1000, claudeEditedAt: t - 1000 }, t)
    ).toBeNull();
  });
});

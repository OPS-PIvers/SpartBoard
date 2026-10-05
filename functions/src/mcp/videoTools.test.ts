import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type * as admin from 'firebase-admin';
import type { ToolContext } from './activity';
import { registerVideoTools, restoreVideoRevision } from './videoTools';

const drive = vi.hoisted(() => ({ files: new Map<string, unknown>() }));
vi.mock('./drive', () => ({
  driveTokenFor: vi.fn(() => Promise.resolve('tok')),
  readDriveJson: vi.fn((_t: string, id: string) =>
    Promise.resolve(drive.files.get(id))
  ),
  saveQuizJson: vi.fn(
    (_t: string, content: { id: string }, id: string | null) => {
      const fileId = id ?? `file-${content.id}`;
      drive.files.set(fileId, content);
      return Promise.resolve(fileId);
    }
  ),
}));

type Data = Record<string, unknown>;

function fakeDb(seed: Record<string, Data> = {}) {
  const docs = new Map(Object.entries(seed));
  let seq = 0;
  const snap = (path: string) => ({
    id: path.split('/').pop(),
    exists: docs.has(path),
    data: () => docs.get(path),
    get: (k: string) => docs.get(path)?.[k],
  });
  const docRef = (path: string): Data => ({
    path,
    id: path.split('/').pop(),
    get: () => Promise.resolve(snap(path)),
  });
  const collection = (path: string): Data => {
    const query: Data = {
      orderBy: () => query,
      startAfter: () => query,
      limit: () => query,
      get: () => {
        const rows = [...docs.keys()]
          .filter(
            (k) =>
              k.startsWith(`${path}/`) &&
              k.split('/').length === path.split('/').length + 1
          )
          .map(snap)
          .sort(
            (a, b) =>
              Number(b.data()?.updatedAt ?? 0) -
              Number(a.data()?.updatedAt ?? 0)
          );
        return Promise.resolve({ docs: rows, size: rows.length });
      },
    };
    return {
      ...query,
      doc: (id?: string) => docRef(`${path}/${id ?? `auto${(seq += 1)}`}`),
    };
  };
  const db = {
    collection,
    doc: docRef,
    runTransaction: async <T>(fn: (tx: Data) => Promise<T>) =>
      fn({
        get: (ref: Data) => Promise.resolve(snap(ref.path as string)),
        set: (ref: Data, data: Data) =>
          docs.set(ref.path as string, {
            ...(docs.get(ref.path as string) ?? {}),
            ...data,
          }),
      }),
    batch: () => {
      const staged: [Data, Data][] = [];
      return {
        set: (ref: Data, data: Data) => staged.push([ref, data]),
        commit: () => {
          staged.forEach(([r, d]) => docs.set(r.path as string, d));
          return Promise.resolve();
        },
      };
    },
  };
  return { db, docs };
}

const URL_OK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const mc = (n: number, timestamp: number) => ({
  type: 'multiple_choice',
  text: `Question ${n}`,
  timestamp_seconds: timestamp,
  correct_answer: 'Right',
  incorrect_answers: ['Wrong'],
});

function ctxFor(db: unknown): ToolContext {
  return {
    db,
    uid: 'u1',
    email: 'u1@example.org',
    grantId: 'g',
  } as unknown as ToolContext;
}

async function connect(db: unknown) {
  const server = new McpServer({ name: 't', version: '1' });
  registerVideoTools(server, ctxFor(db));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return async (name: string, args: Data) => {
    const res = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    const text = res.content[0].text;
    return res.isError ? { error: text } : (JSON.parse(text) as Data);
  };
}

beforeEach(() => {
  drive.files.clear();
});

describe('create_video_activity', () => {
  it('saves to Drive, writes metadata, and logs the create', async () => {
    const { db, docs } = fakeDb();
    const call = await connect(db);
    const res = await call('create_video_activity', {
      title: ' Cells ',
      youtube_url: URL_OK,
      questions: [mc(1, 90), mc(2, 30)],
    });
    expect(res.title).toBe('Cells');
    expect(res.question_count).toBe(2);
    expect(res.questions_missing_answer_key).toBe(0);
    expect(res.previous_version_revision_id).toBeUndefined();
    const id = res.activity_id as string;
    expect(docs.get(`users/u1/video_activities/${id}`)).toMatchObject({
      title: 'Cells',
      driveFileId: `file-${id}`,
    });
    const content = drive.files.get(`file-${id}`) as {
      questions: { timestamp: number }[];
    };
    expect(content.questions.map((q) => q.timestamp)).toEqual([30, 90]);
    const log = [...docs.entries()].find(([k]) =>
      k.startsWith('users/u1/claude_activity/')
    );
    expect(log?.[1]).toMatchObject({
      action: 'create',
      itemType: 'video_activity',
    });
    expect(
      docs.get(`users/u1/claude_usage/${new Date().toISOString().slice(0, 10)}`)
    ).toMatchObject({ writes: 1 });
  });

  it('rejects a non-YouTube link without writing anything', async () => {
    const { db, docs } = fakeDb();
    const call = await connect(db);
    const res = await call('create_video_activity', {
      title: 'Bad',
      youtube_url: 'https://example.com/video',
      questions: [mc(1, 5)],
    });
    expect(res.error).toMatch(/YouTube video link/);
    expect(docs.size).toBe(0);
  });

  it('rejects a folder that does not exist', async () => {
    const { db, docs } = fakeDb();
    const call = await connect(db);
    const res = await call('create_video_activity', {
      title: 'T',
      youtube_url: URL_OK,
      folder_id: 'nope',
      questions: [mc(1, 5)],
    });
    expect(res.error).toMatch(/Folder nope was not found/);
    expect(docs.size).toBe(0);
  });

  it('fails schema validation for empty questions or a blank title', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    expect(
      await call('create_video_activity', {
        title: 'T',
        youtube_url: URL_OK,
        questions: [],
      })
    ).toHaveProperty('error');
    expect(
      await call('create_video_activity', {
        title: '   ',
        youtube_url: URL_OK,
        questions: [mc(1, 5)],
      })
    ).toHaveProperty('error');
  });
});

describe('read tools', () => {
  async function created() {
    const fx = fakeDb();
    const call = await connect(fx.db);
    const a = await call('create_video_activity', {
      title: 'Cells',
      youtube_url: URL_OK,
      questions: [mc(1, 10)],
    });
    return { ...fx, call, id: a.activity_id as string };
  }

  it('get_video_activity returns the link and friendly questions', async () => {
    const { call, id } = await created();
    const res = await call('get_video_activity', { activity_id: id });
    expect(res.youtube_url).toBe(URL_OK);
    expect(res.questions).toHaveLength(1);
  });

  it('get_video_activity reports an unknown id', async () => {
    const { call } = await created();
    const res = await call('get_video_activity', { activity_id: 'missing' });
    expect(res.error).toMatch(/not found/);
  });

  it('list_video_activities filters by title search', async () => {
    const { call } = await created();
    const hit = await call('list_video_activities', { search: 'cell' });
    expect(hit.video_activities).toHaveLength(1);
    const miss = await call('list_video_activities', { search: 'zzz' });
    expect(miss.video_activities).toEqual([]);
    expect(miss.next_cursor).toBeNull();
  });
});

describe('update_video_activity', () => {
  async function created() {
    const fx = fakeDb();
    const call = await connect(fx.db);
    const a = await call('create_video_activity', {
      title: 'Cells',
      youtube_url: URL_OK,
      questions: [mc(1, 10)],
    });
    return { ...fx, call, id: a.activity_id as string };
  }

  it('changes only passed fields and snapshots the previous version', async () => {
    const { call, id, docs } = await created();
    const res = await call('update_video_activity', {
      activity_id: id,
      title: 'Cells 2',
    });
    expect(res.title).toBe('Cells 2');
    expect(res.question_count).toBe(1);
    expect(res.youtube_url).toBe(URL_OK);
    const revId = res.previous_version_revision_id as string;
    expect(revId).toBeTruthy();
    expect(
      [...docs.keys()].some((k) => k.endsWith(`claude_revisions/${revId}`))
    ).toBe(true);
  });

  it('refuses to edit an activity shared with a PLC', async () => {
    const { call, id, docs } = await created();
    const path = `users/u1/video_activities/${id}`;
    docs.set(path, { ...(docs.get(path) as Data), sync: { plcId: 'p' } });
    const res = await call('update_video_activity', {
      activity_id: id,
      title: 'X',
    });
    expect(res.error).toMatch(/shared with a PLC/);
  });

  it('rejects a bad youtube_url and an unknown folder', async () => {
    const { call, id } = await created();
    expect(
      (
        await call('update_video_activity', {
          activity_id: id,
          youtube_url: 'x',
        })
      ).error
    ).toMatch(/YouTube/);
    expect(
      (
        await call('update_video_activity', {
          activity_id: id,
          folder_id: 'nope',
        })
      ).error
    ).toMatch(/Folder nope/);
  });

  it('stops at the daily write cap', async () => {
    const { call, id, docs } = await created();
    docs.set(`users/u1/claude_usage/${new Date().toISOString().slice(0, 10)}`, {
      writes: 300,
    });
    const res = await call('update_video_activity', {
      activity_id: id,
      title: 'X',
    });
    expect(res.error).toMatch(/Daily limit/);
  });
});

describe('restoreVideoRevision', () => {
  const rev = (data: unknown, itemId = 'a1') =>
    ({
      get: (k: string) => (k === 'data' ? data : itemId),
    }) as unknown as admin.firestore.DocumentSnapshot;

  it('explains a revision that was too large to keep', async () => {
    const { db } = fakeDb();
    await expect(
      restoreVideoRevision(ctxFor(db), rev({ content: null, tooLarge: true }))
    ).rejects.toThrow(/too large/);
  });

  it('writes the old content back under the current id', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    const made = await call('create_video_activity', {
      title: 'New',
      youtube_url: URL_OK,
      questions: [mc(1, 10)],
    });
    const id = made.activity_id as string;
    const old = {
      id: 'stale',
      title: 'Old',
      youtubeUrl: URL_OK,
      questions: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const res = await restoreVideoRevision(
      ctxFor(db),
      rev({ content: old }, id)
    );
    expect(res).toMatchObject({ activity_id: id, title: 'Old' });
    expect(res.previous_version_revision_id).toBeTruthy();
  });
});

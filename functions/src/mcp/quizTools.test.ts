import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type * as admin from 'firebase-admin';
import type { ToolContext } from './activity';
import { registerQuizTools, restoreQuizRevision } from './quizTools';

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

const mc = (n: number) => ({
  type: 'multiple_choice',
  text: `Question ${n}`,
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
  registerQuizTools(server, ctxFor(db));
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

describe.each([
  {
    label: 'quiz',
    create: 'create_quiz',
    get: 'get_quiz',
    list: 'list_quizzes',
    update: 'update_quiz',
    idKey: 'quiz_id',
    listKey: 'quizzes',
    collection: 'quizzes',
    folders: 'quiz_folders',
    itemType: 'quiz',
  },
  {
    label: 'question bank',
    create: 'create_question_bank',
    get: 'get_question_bank',
    list: 'list_question_banks',
    update: 'update_question_bank',
    idKey: 'bank_id',
    listKey: 'question_banks',
    collection: 'question_banks',
    folders: 'question_bank_folders',
    itemType: 'question_bank',
  },
])('$label tools', (k) => {
  async function created() {
    const fx = fakeDb();
    const call = await connect(fx.db);
    const a = await call(k.create, { title: 'Cells', questions: [mc(1)] });
    return { ...fx, call, id: a[k.idKey] as string };
  }

  describe('create', () => {
    it('saves to Drive, writes metadata, and logs the create', async () => {
      const { db, docs } = fakeDb();
      const call = await connect(db);
      const res = await call(k.create, {
        title: ' Cells ',
        questions: [mc(1), mc(2)],
      });
      expect(res.title).toBe('Cells');
      expect(res.question_count).toBe(2);
      expect(res.questions_missing_answer_key).toBe(0);
      expect(res.previous_version_revision_id).toBeUndefined();
      const id = res[k.idKey] as string;
      expect(docs.get(`users/u1/${k.collection}/${id}`)).toMatchObject({
        title: 'Cells',
        driveFileId: `file-${id}`,
      });
      expect(
        (drive.files.get(`file-${id}`) as { questions: unknown[] }).questions
      ).toHaveLength(2);
      const log = [...docs.entries()].find(([key]) =>
        key.startsWith('users/u1/claude_activity/')
      );
      expect(log?.[1]).toMatchObject({
        action: 'create',
        itemType: k.itemType,
      });
      expect(
        docs.get(
          `users/u1/claude_usage/${new Date().toISOString().slice(0, 10)}`
        )
      ).toMatchObject({ writes: 1 });
    });

    it('rejects a folder that does not exist without writing', async () => {
      const { db, docs } = fakeDb();
      const call = await connect(db);
      const res = await call(k.create, {
        title: 'T',
        folder_id: 'nope',
        questions: [mc(1)],
      });
      expect(res.error).toMatch(/Folder nope was not found/);
      expect(docs.size).toBe(0);
    });

    it('files the item in an existing folder', async () => {
      const { db, docs } = fakeDb({ [`users/u1/${k.folders}/f1`]: {} });
      const call = await connect(db);
      const res = await call(k.create, {
        title: 'T',
        folder_id: 'f1',
        questions: [mc(1)],
      });
      expect(res.folder_id).toBe('f1');
      expect(
        docs.get(`users/u1/${k.collection}/${res[k.idKey] as string}`)
      ).toMatchObject({ folderId: 'f1' });
    });

    it('fails schema validation for empty questions, a blank title or a bad language', async () => {
      const { db } = fakeDb();
      const call = await connect(db);
      expect(
        await call(k.create, { title: 'T', questions: [] })
      ).toHaveProperty('error');
      expect(
        await call(k.create, { title: '   ', questions: [mc(1)] })
      ).toHaveProperty('error');
      expect(
        await call(k.create, {
          title: 'T',
          language: 'not a tag!',
          questions: [mc(1)],
        })
      ).toHaveProperty('error');
    });

    it('rejects a multiple_choice question with no correct_answer', async () => {
      const { db, docs } = fakeDb();
      const call = await connect(db);
      const res = await call(k.create, {
        title: 'T',
        questions: [{ type: 'multiple_choice', text: 'No key' }],
      });
      expect(res.error).toMatch(/needs correct_answer/);
      expect(docs.size).toBe(0);
    });
  });

  describe('read tools', () => {
    it('get returns friendly questions', async () => {
      const { call, id } = await created();
      const res = await call(k.get, { [k.idKey]: id });
      expect(res.questions).toHaveLength(1);
      expect(res.shared_with_plc).toBe(false);
    });

    it('get reports an unknown id', async () => {
      const { call } = await created();
      const res = await call(k.get, { [k.idKey]: 'missing' });
      expect(res.error).toMatch(/not found/);
    });

    it('list filters by title search', async () => {
      const { call } = await created();
      const hit = await call(k.list, { search: 'cell' });
      expect(hit[k.listKey]).toHaveLength(1);
      const miss = await call(k.list, { search: 'zzz' });
      expect(miss[k.listKey]).toEqual([]);
      expect(miss.next_cursor).toBeNull();
    });
  });

  describe('update', () => {
    it('changes only passed fields and snapshots the previous version', async () => {
      const { call, id, docs } = await created();
      const res = await call(k.update, { [k.idKey]: id, title: 'Cells 2' });
      expect(res.title).toBe('Cells 2');
      expect(res.question_count).toBe(1);
      const revId = res.previous_version_revision_id as string;
      expect(revId).toBeTruthy();
      expect(
        [...docs.keys()].some((key) =>
          key.endsWith(`claude_revisions/${revId}`)
        )
      ).toBe(true);
    });

    it('replaces the question list and keeps ids that are passed back', async () => {
      const { call, id } = await created();
      const before = await call(k.get, { [k.idKey]: id });
      const qid = (before.questions as { id: string }[])[0].id;
      const res = await call(k.update, {
        [k.idKey]: id,
        questions: [{ ...mc(1), id: qid }, mc(2)],
      });
      expect(res.question_count).toBe(2);
      const after = await call(k.get, { [k.idKey]: id });
      expect((after.questions as { id: string }[])[0].id).toBe(qid);
    });

    it('rejects an unknown folder', async () => {
      const { call, id } = await created();
      expect(
        (await call(k.update, { [k.idKey]: id, folder_id: 'nope' })).error
      ).toMatch(/Folder nope/);
    });

    it('moves into a folder and back to top level with null', async () => {
      const { call, id, docs } = await created();
      docs.set(`users/u1/${k.folders}/f1`, {});
      const moved = await call(k.update, { [k.idKey]: id, folder_id: 'f1' });
      expect(moved.folder_id).toBe('f1');
      const back = await call(k.update, { [k.idKey]: id, folder_id: null });
      expect(back.folder_id).toBeNull();
    });

    it('refuses to edit an item shared with a PLC', async () => {
      const { call, id, docs } = await created();
      const path = `users/u1/${k.collection}/${id}`;
      docs.set(path, { ...(docs.get(path) as Data), sync: { plcId: 'p' } });
      const res = await call(k.update, { [k.idKey]: id, title: 'X' });
      expect(res.error).toMatch(/shared with a PLC/);
    });

    it('reports an unknown id', async () => {
      const { call } = await created();
      const res = await call(k.update, { [k.idKey]: 'missing', title: 'X' });
      expect(res.error).toMatch(/not found/);
    });

    it('stops at the daily write cap', async () => {
      const { call, id, docs } = await created();
      docs.set(
        `users/u1/claude_usage/${new Date().toISOString().slice(0, 10)}`,
        { writes: 300 }
      );
      const res = await call(k.update, { [k.idKey]: id, title: 'X' });
      expect(res.error).toMatch(/Daily limit/);
    });
  });
});

describe('restoreQuizRevision', () => {
  const rev = (data: unknown, itemId = 'a1', itemType = 'quiz') =>
    ({
      get: (key: string) =>
        key === 'data' ? data : key === 'itemType' ? itemType : itemId,
    }) as unknown as admin.firestore.DocumentSnapshot;

  it('explains a revision that was too large to keep', async () => {
    const { db } = fakeDb();
    await expect(
      restoreQuizRevision(ctxFor(db), rev({ content: null, tooLarge: true }))
    ).rejects.toThrow(/too large/);
  });

  it('writes the old content back under the current id', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    const made = await call('create_quiz', {
      title: 'New',
      questions: [mc(1)],
    });
    const id = made.quiz_id as string;
    const old = {
      id: 'stale',
      title: 'Old',
      questions: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const res = await restoreQuizRevision(
      ctxFor(db),
      rev({ content: old }, id)
    );
    expect(res).toMatchObject({ quiz_id: id, title: 'Old' });
    expect(res.previous_version_revision_id).toBeTruthy();
  });

  it('restores a question bank revision', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    const made = await call('create_question_bank', {
      title: 'Bank',
      questions: [mc(1)],
    });
    const id = made.bank_id as string;
    const old = {
      id,
      title: 'Old bank',
      questions: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const res = await restoreQuizRevision(
      ctxFor(db),
      rev({ content: old }, id, 'question_bank')
    );
    expect(res).toMatchObject({ bank_id: id, title: 'Old bank' });
  });
});

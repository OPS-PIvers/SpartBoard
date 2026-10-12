import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type * as admin from 'firebase-admin';
import type { ToolContext } from './activity';
import { registerMiniAppTools, restoreMiniAppRevision } from './miniAppTools';
import { summarizeMiniAppSubmissions } from './resultsTools';
import {
  checkMiniAppSource,
  gradeMiniAppResult,
  parseMiniAppResult,
  readAnswerKey,
  readManifest,
} from '../miniAppGrading';
import { MINI_APP_BASIC_SPEC, MINI_APP_RESULTS_SPEC } from '../miniAppSpec';

const flag = vi.hoisted(() => ({ granted: true }));
vi.mock('../quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(() => Promise.resolve(flag.granted)),
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
      select: () => query,
      limit: () => query,
      get: () => {
        const rows = [...docs.keys()]
          .filter(
            (k) =>
              k.startsWith(`${path}/`) &&
              k.split('/').length === path.split('/').length + 1
          )
          .map(snap);
        return Promise.resolve({
          docs: rows,
          size: rows.length,
          empty: rows.length === 0,
        });
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
      const staged: (() => void)[] = [];
      return {
        set: (ref: Data, data: Data) =>
          staged.push(() => docs.set(ref.path as string, data)),
        delete: (ref: Data) =>
          staged.push(() => docs.delete(ref.path as string)),
        commit: () => {
          staged.forEach((apply) => apply());
          return Promise.resolve();
        },
      };
    },
  };
  return { db, docs };
}

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
  registerMiniAppTools(server, ctxFor(db));
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

const EXAMPLE_HTML = /```html\n([\s\S]*?)```/.exec(MINI_APP_RESULTS_SPEC)?.[1];
const MANIFEST = {
  questions: [
    { id: 'q1', type: 'numeric', prompt: 'What is 3/4 of 20?' },
    { id: 'q2', type: 'tf', prompt: '2/4 equals 1/2' },
  ],
};
const KEY = { questions: { q1: { correct: 15 }, q2: { correct: true } } };

beforeEach(() => {
  flag.granted = true;
});

describe('Mini App spec', () => {
  it('has a worked example that passes the check and grades as written', () => {
    expect(EXAMPLE_HTML).toBeTruthy();
    const html = EXAMPLE_HTML ?? '';
    expect(checkMiniAppSource(html, MANIFEST, KEY)).toEqual([]);
    const grade = gradeMiniAppResult(
      parseMiniAppResult({
        items: [
          { id: 'q1', answer: 15 },
          { id: 'q2', answer: true },
        ],
      }),
      readManifest(MANIFEST),
      readAnswerKey(KEY)
    );
    expect(grade).toMatchObject({ score: 2, maxScore: 2, gradedBy: 'server' });
  });

  it('names every question type', () => {
    for (const type of [
      'mc',
      'multi',
      'tf',
      'numeric',
      'short',
      'order',
      'other',
    ])
      expect(MINI_APP_RESULTS_SPEC).toContain(`\`${type}\``);
  });
});

describe('get_mini_app_spec', () => {
  it('gives the results spec only when results are on for the teacher', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    expect(await call('get_mini_app_spec', {})).toEqual({
      results_scoring: true,
      spec: MINI_APP_RESULTS_SPEC,
    });
    flag.granted = false;
    expect(await call('get_mini_app_spec', {})).toEqual({
      results_scoring: false,
      spec: MINI_APP_BASIC_SPEC,
    });
  });

  it('treats Mini App submissions set to view only as off', async () => {
    const { db } = fakeDb({
      'global_permissions/assignment-modes': {
        config: { miniApp: 'view-only' },
      },
    });
    const call = await connect(db);
    expect(await call('get_mini_app_spec', {})).toMatchObject({
      results_scoring: false,
    });
  });
});

describe('create_mini_app with results', () => {
  it('refuses an app that cannot send results and writes nothing', async () => {
    const { db, docs } = fakeDb();
    const call = await connect(db);
    const res = await call('create_mini_app', {
      title: 'Broken',
      html: '<p>hi</p>',
      collects_results: true,
      manifest: MANIFEST,
      answer_key: KEY,
    });
    expect(res.error).toMatch(/Not saved\. The app never sends results/);
    expect(docs.size).toBe(0);
  });

  it('refuses an answer key for a question the app does not have', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    const res = await call('create_mini_app', {
      title: 'Extra',
      html: EXAMPLE_HTML,
      collects_results: true,
      manifest: MANIFEST,
      answer_key: { questions: { ...KEY.questions, q9: { correct: 'x' } } },
    });
    expect(res.error).toMatch(/answer key has q9, which is not a question/);
  });

  it('saves the app, its questions and the key apart', async () => {
    const { db, docs } = fakeDb();
    const call = await connect(db);
    const res = await call('create_mini_app', {
      title: 'Fractions',
      html: EXAMPLE_HTML,
      collects_results: true,
      manifest: MANIFEST,
      answer_key: KEY,
    });
    const id = res.app_id as string;
    expect(res.collects_results).toBe(true);
    const app = docs.get(`users/u1/miniapps/${id}`);
    expect(app).toMatchObject({ collectsResults: true, manifest: MANIFEST });
    expect(JSON.stringify(app)).not.toContain('correct');
    expect(docs.get(`users/u1/mini_app_keys/${id}`)).toEqual(KEY);
    expect(await call('get_mini_app', { app_id: id })).toMatchObject({
      manifest: MANIFEST,
      answer_key: KEY,
    });
  });

  it('drops results fields when results are off for the teacher', async () => {
    flag.granted = false;
    const { db, docs } = fakeDb();
    const call = await connect(db);
    const res = await call('create_mini_app', {
      title: 'Inert',
      html: '<p>hi</p>',
      collects_results: true,
      manifest: MANIFEST,
      answer_key: KEY,
    });
    expect(res.note).toMatch(/Results scoring isn't on/);
    const id = String(res.app_id);
    const app = docs.get(`users/u1/miniapps/${id}`);
    expect(app).not.toHaveProperty('collectsResults');
    expect(app).not.toHaveProperty('manifest');
    expect(docs.has(`users/u1/mini_app_keys/${id}`)).toBe(false);
    const upd = await call('update_mini_app', {
      app_id: id,
      collects_results: true,
      answer_key: KEY,
    });
    expect(upd.note).toMatch(/Results scoring isn't on/);
    expect(docs.get(`users/u1/miniapps/${id}`)).not.toHaveProperty(
      'collectsResults'
    );
    expect(docs.has(`users/u1/mini_app_keys/${id}`)).toBe(false);
  });

  it('leaves a plain app without results fields', async () => {
    const { db, docs } = fakeDb();
    const call = await connect(db);
    const res = await call('create_mini_app', {
      title: 'Timer',
      html: '<p>timer</p>',
    });
    const app = docs.get(`users/u1/miniapps/${String(res.app_id)}`);
    expect(app).not.toHaveProperty('collectsResults');
    expect(app).not.toHaveProperty('manifest');
  });
});

describe('update_mini_app with results', () => {
  const seed = () => ({
    'users/u1/miniapps/a1': {
      id: 'a1',
      title: 'Fractions',
      html: EXAMPLE_HTML,
      createdAt: 1,
      order: 0,
      collectsResults: true,
      manifest: MANIFEST,
    },
    'users/u1/mini_app_keys/a1': KEY,
  });

  it('checks html changes against the saved key', async () => {
    const { db } = fakeDb(seed());
    const call = await connect(db);
    const res = await call('update_mini_app', {
      app_id: 'a1',
      html: `${EXAMPLE_HTML ?? ''}<script>const correctAnswer = 'true';</script>`,
    });
    expect(res.error).toBeUndefined();
    const leak = await call('update_mini_app', {
      app_id: 'a1',
      answer_key: {
        questions: { q1: { correct: 15 }, q2: { correct: 'true' } },
      },
    });
    expect(leak.error).toMatch(/shows the answer to q2/);
  });

  it('lets a rename through without a check', async () => {
    const { db, docs } = fakeDb({
      ...seed(),
      'users/u1/miniapps/a1': {
        ...seed()['users/u1/miniapps/a1'],
        html: '<p/>',
      },
    });
    const call = await connect(db);
    expect(
      await call('update_mini_app', { app_id: 'a1', title: 'New' })
    ).toMatchObject({
      title: 'New',
    });
    expect(docs.get('users/u1/mini_app_keys/a1')).toEqual(KEY);
  });

  it('undoes the key together with the app', async () => {
    const { db, docs } = fakeDb(seed());
    const call = await connect(db);
    const newKey = {
      questions: { q1: { correct: 16 }, q2: { correct: false } },
    };
    const res = await call('update_mini_app', {
      app_id: 'a1',
      answer_key: newKey,
    });
    expect(docs.get('users/u1/mini_app_keys/a1')).toEqual(newKey);
    const revPath = `users/u1/claude_revisions/${String(res.previous_version_revision_id)}`;
    const rev = docs.get(revPath) ?? {};
    await restoreMiniAppRevision(ctxFor(db), {
      get: (k: string) => rev[k],
    } as unknown as admin.firestore.DocumentSnapshot);
    expect(docs.get('users/u1/mini_app_keys/a1')).toEqual(KEY);
    expect(docs.get('users/u1/miniapps/a1')).not.toHaveProperty('answerKey');
  });

  it('keeps the key when restoring a revision saved before keys rode along', async () => {
    const { db, docs } = fakeDb(seed());
    await restoreMiniAppRevision(ctxFor(db), {
      get: (k: string) =>
        k === 'itemId'
          ? 'a1'
          : k === 'data'
            ? { ...seed()['users/u1/miniapps/a1'] }
            : undefined,
    } as unknown as admin.firestore.DocumentSnapshot);
    expect(docs.get('users/u1/mini_app_keys/a1')).toEqual(KEY);
  });
});

describe('summarizeMiniAppSubmissions', () => {
  it('pools best attempts into class-level numbers', () => {
    const questions = readManifest(MANIFEST);
    const sub = (score: number, q1: boolean, q2: boolean, attempts = 1) => ({
      attemptCount: attempts,
      best: {
        score,
        maxScore: 2,
        items: [
          { id: 'q1', correct: q1, by: 'server' },
          { id: 'q2', correct: q2, by: 'app' },
        ],
      },
    });
    const out = summarizeMiniAppSubmissions(questions, [
      sub(2, true, true),
      sub(1, true, false, 3),
      sub(0, false, false),
      { attemptCount: 0, payload: { completed: true } },
    ]);
    expect(out).toMatchObject({
      completed_responses: 4,
      scored_responses: 3,
      average_percent: 50,
      average_attempts: 1.3,
      questions: [
        { question_id: 'q1', graded: 3, percent_correct: 67 },
        { question_id: 'q2', graded: 3, percent_correct: 33, scored_by: 'app' },
      ],
    });
    expect(out.score_bands.find((b) => b.percent === '90-100')?.students).toBe(
      1
    );
  });
});

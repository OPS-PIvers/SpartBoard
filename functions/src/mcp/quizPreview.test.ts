import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ToolContext } from './activity';
import { registerQuizTools } from './quizTools';
import { registerRubricTools } from './rubricTools';
import { PREVIEW_URI, registerAppResources } from './apps';
import { slimToolListing, stripAppMeta } from './toolKit';

const drive = vi.hoisted(() => ({ files: new Map<string, unknown>() }));
const flags = vi.hoisted(() => ({ apps: false }));
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
vi.mock('../quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(() => Promise.resolve(flags.apps)),
}));

type Data = Record<string, unknown>;
type Raw = {
  isError?: boolean;
  structuredContent?: Data;
  content: { text: string }[];
};

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
  const db = {
    doc: docRef,
    collection: (path: string) => ({
      doc: (id?: string) => docRef(`${path}/${id ?? `auto${(seq += 1)}`}`),
    }),
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

const RUBRIC = {
  id: 'r1',
  title: 'Claim and evidence',
  criteria: [
    {
      id: 'c1',
      name: 'Claim',
      levels: [
        { id: 'l1', label: 'Missing', points: 0 },
        { id: 'l2', label: 'Clear', points: 4 },
      ],
    },
    {
      id: 'c2',
      name: 'Evidence',
      levels: [
        { id: 'l3', label: 'None', points: 0 },
        { id: 'l4', label: 'Strong', points: 3 },
      ],
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

const mc = (n: number) => ({
  type: 'multiple_choice',
  text: `Question ${n}`,
  correct_answer: 'Right',
  incorrect_answers: ['Wrong'],
});
const fr = (extra: Data = {}) => ({
  type: 'free_response',
  text: 'Explain osmosis.',
  ...extra,
});

async function connect(seed: Record<string, Data> = {}) {
  const fx = fakeDb({ 'users/u1/rubrics/r1': RUBRIC, ...seed });
  const ctx = {
    db: fx.db,
    uid: 'u1',
    email: 'u1@example.org',
    grantId: 'g',
  } as unknown as ToolContext;
  const server = new McpServer({ name: 't', version: '1' });
  registerQuizTools(server, ctx);
  registerRubricTools(server, ctx);
  registerAppResources(server);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const raw = async (name: string, args: Data) =>
    (await client.callTool({ name, arguments: args })) as Raw;
  const call = async (name: string, args: Data) => {
    const res = await raw(name, args);
    const text = res.content[0].text;
    return res.isError ? { error: text } : (JSON.parse(text) as Data);
  };
  return { ...fx, client, server, raw, call };
}

const stored = (id: string) =>
  (drive.files.get(`file-${id}`) as { questions: Data[] }).questions;

beforeEach(() => {
  drive.files.clear();
  flags.apps = false;
});

describe('rubric_id on free_response questions', () => {
  it('attaches a frozen copy and sets points to the rubric total', async () => {
    const { call } = await connect();
    const res = await call('create_quiz', {
      title: 'Cells',
      questions: [fr({ rubric_id: 'r1', points: 1 })],
    });
    const q = stored(res.quiz_id as string)[0];
    expect(q).toMatchObject({ rubricId: 'r1', points: 7 });
    expect(q.rubricSnapshot).toMatchObject({
      id: 'r1',
      title: 'Claim and evidence',
    });
    expect(q.rubricVisibleToStudents).toBeUndefined();
    const got = await call('get_quiz', { quiz_id: res.quiz_id });
    expect((got.questions as Data[])[0]).toMatchObject({ rubric_id: 'r1' });
  });

  it('keeps the attached copy when the same id comes back', async () => {
    const { call, docs } = await connect();
    const res = await call('create_quiz', {
      title: 'Cells',
      questions: [fr({ rubric_id: 'r1' })],
    });
    const id = res.quiz_id as string;
    docs.set('users/u1/rubrics/r1', { ...RUBRIC, title: 'Renamed' });
    const got = await call('get_quiz', { quiz_id: id });
    await call('update_quiz', { quiz_id: id, questions: got.questions });
    expect(stored(id)[0].rubricSnapshot).toMatchObject({
      title: 'Claim and evidence',
    });
  });

  it('keeps the rubric total as points when other fields change', async () => {
    const { call } = await connect();
    const res = await call('create_quiz', {
      title: 'Cells',
      questions: [fr({ rubric_id: 'r1' })],
    });
    const id = res.quiz_id as string;
    const got = await call('get_quiz', { quiz_id: id });
    const q = (got.questions as Data[])[0];
    await call('update_quiz', {
      quiz_id: id,
      questions: [{ ...q, text: 'Explain diffusion.', points: 2 }],
    });
    expect(stored(id)[0]).toMatchObject({
      text: 'Explain diffusion.',
      points: 7,
      rubricId: 'r1',
    });
  });

  it('removes the rubric with null and keeps the points', async () => {
    const { call } = await connect();
    const res = await call('create_quiz', {
      title: 'Cells',
      questions: [fr({ rubric_id: 'r1' })],
    });
    const id = res.quiz_id as string;
    const got = await call('get_quiz', { quiz_id: id });
    const q = (got.questions as Data[])[0];
    await call('update_quiz', {
      quiz_id: id,
      questions: [{ ...q, rubric_id: null }],
    });
    const after = stored(id)[0];
    expect(after.rubricId).toBeUndefined();
    expect(after.rubricSnapshot).toBeUndefined();
    expect(after.points).toBe(7);
  });

  it('refuses a rubric on another question type', async () => {
    const { call } = await connect();
    const res = await call('create_quiz', {
      title: 'Cells',
      questions: [{ ...mc(1), rubric_id: 'r1' }],
    });
    expect(res.error).toMatch(/only works on free_response/);
  });

  it('reports a rubric that is not in the library', async () => {
    const { call } = await connect();
    const res = await call('create_quiz', {
      title: 'Cells',
      questions: [fr({ rubric_id: 'nope' })],
    });
    expect(res.error).toMatch(/rubric was not found/);
  });
});

describe('preview card', () => {
  it('points the quiz and rubric tools at the preview page', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const name of [
      'get_quiz',
      'create_quiz',
      'update_quiz',
      'get_question_bank',
      'get_rubric',
      'create_rubric',
      'update_rubric',
    ]) {
      expect(tools.find((t) => t.name === name)?._meta).toMatchObject({
        ui: { resourceUri: PREVIEW_URI },
      });
    }
    expect(tools.find((t) => t.name === 'list_quizzes')?._meta).toBeUndefined();
  });

  it('serves the page as an MCP App resource', async () => {
    const { client } = await connect();
    const res = await client.readResource({ uri: PREVIEW_URI });
    const page = res.contents[0] as { mimeType?: string; text?: string };
    expect(page.mimeType).toBe('text/html;profile=mcp-app');
    expect(page.text).toMatch(/^<!doctype html>/);
    expect(page.text).toContain('id="root"');
  });

  it('leaves the preview link out of the tool list while the flag is off', async () => {
    const { client, server } = await connect();
    slimToolListing(server, undefined, () => Promise.resolve(flags.apps));
    const off = await client.listTools();
    expect(off.tools.find((t) => t.name === 'get_quiz')?._meta).toBeUndefined();
    flags.apps = true;
    const on = await client.listTools();
    expect(on.tools.find((t) => t.name === 'get_quiz')?._meta).toMatchObject({
      ui: { resourceUri: PREVIEW_URI },
    });
  });

  it('keeps other _meta keys when stripping the preview link', () => {
    expect(
      stripAppMeta({
        name: 'x',
        _meta: { ui: { resourceUri: PREVIEW_URI }, other: 1 },
      })
    ).toEqual({ name: 'x', _meta: { other: 1 } });
  });

  it('sends no card data while the flag is off', async () => {
    const { raw } = await connect();
    const res = await raw('create_quiz', {
      title: 'Cells',
      questions: [mc(1)],
    });
    expect(res.structuredContent).toBeUndefined();
    expect(
      (JSON.parse(res.content[0].text) as Data).preview_shown
    ).toBeUndefined();
  });

  it('sends the card and marks what an edit changed', async () => {
    flags.apps = true;
    const { raw } = await connect();
    const made = await raw('create_quiz', {
      title: 'Cells',
      questions: [mc(1), mc(2), fr()],
    });
    expect(made.structuredContent).toMatchObject({
      view: 'quiz',
      kind: 'quiz',
      title: 'Cells',
      total_points: 3,
      removed_questions: 0,
    });
    const text = JSON.parse(made.content[0].text) as Data;
    expect(text.preview_shown).toMatch(/preview card/);
    const view = made.structuredContent as { questions: Data[] };
    const [q1, , q3] = view.questions;
    expect(q3.rubric).toBeNull();
    const edited = await raw('update_quiz', {
      quiz_id: text.quiz_id,
      questions: [
        { ...mc(1), id: q1.id },
        { ...fr(), id: q3.id, rubric_id: 'r1' },
      ],
    });
    const card = edited.structuredContent as {
      questions: Data[];
      removed_questions: number;
      total_points: number;
    };
    expect(card.removed_questions).toBe(1);
    expect(card.total_points).toBe(8);
    expect(card.questions.map((q) => q.changed)).toEqual([false, true]);
    expect(card.questions[1].rubric).toMatchObject({
      title: 'Claim and evidence',
      max_points: 7,
      shown_to_students: false,
    });
    expect(
      (JSON.parse(edited.content[0].text) as Data).changed_questions
    ).toEqual([2]);
  });

  it('sends a rubric card from the rubric tools', async () => {
    flags.apps = true;
    const { raw } = await connect();
    const res = await raw('get_rubric', { rubric_id: 'r1' });
    expect(res.structuredContent).toMatchObject({
      view: 'rubric',
      rubric_id: 'r1',
      max_points: 7,
      criteria: [{ name: 'Claim' }, { name: 'Evidence' }],
    });
  });

  it('sends no card for an error', async () => {
    flags.apps = true;
    const { raw } = await connect();
    const res = await raw('get_rubric', { rubric_id: 'nope' });
    expect(res.isError).toBe(true);
    expect(res.structuredContent).toBeUndefined();
  });
});

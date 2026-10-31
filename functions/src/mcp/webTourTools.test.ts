import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type * as admin from '../firebaseAdmin';
import type { ToolContext } from './activity';
import {
  WEB_TOUR_TOOLS,
  applyWebStepText,
  publishState,
  registerWebTourTools,
  restoreWebTourRevision,
  isWebTourPicturePath,
} from './webTourTools';
import { webTourTextHits } from './webTourStudentData';
import { fixKey, runFixClues } from './webTourFixes';

const h = vi.hoisted(() => ({
  flags: new Set(['claude-connector-guided-learning', 'web-tours']),
  files: new Map<string, { bytes: Buffer; contentType: string }>(),
}));

vi.mock('../quizMediaArchive', () => ({
  isGlobalFeatureGranted: (_db: unknown, id: string) =>
    Promise.resolve(h.flags.has(id)),
}));

vi.mock('../firebaseAdmin', () => ({
  apps: [{}],
  storage: () => ({
    bucket: () => ({
      name: 'bucket',
      file: (path: string) => ({
        getMetadata: () => {
          const f = h.files.get(path);
          return Promise.resolve([
            { contentType: f?.contentType, size: f?.bytes.length },
          ]);
        },
        download: () => Promise.resolve([h.files.get(path)?.bytes]),
      }),
    }),
  }),
  firestore: { Timestamp: { fromMillis: (ms: number) => ({ ms }) } },
}));

vi.mock('./miniAppTools', async (importActual) => ({
  ...(await importActual<typeof import('./miniAppTools')>()),
  miniAppResultsOn: () => Promise.resolve(false),
}));

type Data = Record<string, unknown>;

function fakeDb(seed: Record<string, Data>) {
  const docs = new Map(Object.entries(seed));
  const versions = new Map<string, number>();
  const snap = (path: string) => ({
    id: path.split('/').pop(),
    exists: docs.has(path),
    data: () => docs.get(path),
    get: (k: string) => docs.get(path)?.[k],
    updateTime: versions.get(path) ?? 0,
  });
  const docRef = (path: string): Data => ({
    path,
    id: path.split('/').pop(),
    get: () => Promise.resolve(snap(path)),
  });
  let seq = 0;
  const collection = (path: string): Data => {
    const query: Data = {
      select: () => query,
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
      doc: (id?: string) => docRef(`${path}/${id ?? `auto${(seq += 1)}`}`),
    };
  };
  const db = {
    collection,
    doc: docRef,
    runTransaction: async <T>(fn: (tx: Data) => Promise<T>) =>
      fn({
        get: (ref: Data) => Promise.resolve(snap(ref.path as string)),
        set: (ref: Data, data: Data) => docs.set(ref.path as string, data),
      }),
    batch: () => {
      const staged: (() => void)[] = [];
      const checks: (() => boolean)[] = [];
      return {
        set: (ref: Data, data: Data) =>
          staged.push(() => docs.set(ref.path as string, data)),
        update: (ref: Data, data: Data, pre?: { lastUpdateTime?: number }) => {
          const path = ref.path as string;
          checks.push(
            () =>
              pre?.lastUpdateTime === undefined ||
              pre.lastUpdateTime === (versions.get(path) ?? 0)
          );
          staged.push(() => {
            docs.set(path, { ...docs.get(path), ...data });
            versions.set(path, (versions.get(path) ?? 0) + 1);
          });
        },
        commit: () => {
          if (checks.some((ok) => !ok()))
            return Promise.reject(Object.assign(new Error('x'), { code: 9 }));
          staged.forEach((apply) => apply());
          return Promise.resolve();
        },
      };
    },
  };
  const bump = (path: string) =>
    versions.set(path, (versions.get(path) ?? 0) + 1);
  return { db, docs, bump };
}

const EMAIL = 'admin@school.org';
const STEP_A = {
  id: 'a',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  label: 'Click Gradebook',
  text: '',
  web: {
    urlPattern: 'https://lms.example.com/course/*',
    action: 'click',
    locator: {
      role: 'link',
      name: 'Gradebook',
      text: 'Gradebook',
      css: '#nav > a:nth-child(3)',
      box: { x: 0.1, y: 0.2, w: 0.1, h: 0.05 },
    },
    picture: { path: 'web_tour_pictures/t1/p1.jpg', w: 800, h: 600 },
  },
};
const STEP_B = {
  id: 'b',
  label: 'Look at Grades',
  text: 'Old tip',
  web: {
    urlPattern: 'https://lms.example.com/grades',
    action: 'observe',
    locator: { text: 'Grades' },
  },
};
const tour = (): Data => ({
  title: 'Find the gradebook',
  surface: 'web',
  mode: 'tour',
  updatedAt: 10,
  webPicturesChecked: { by: 'u1', at: 1, sig: 'abc' },
  steps: [STEP_A, STEP_B],
});

const matching = (re: RegExp): unknown => expect.stringMatching(re);
const containing = (o: Data): unknown => expect.objectContaining(o);

let env: ReturnType<typeof fakeDb>;

function seed(extra: Record<string, Data> = {}, isAdmin = true) {
  env = fakeDb({
    ...(isAdmin ? { [`admins/${EMAIL}`]: {} } : {}),
    'building_web_tours/t1': tour(),
    'building_guided_learning/live1': { mode: 'tour', steps: [] },
    ...extra,
  });
  return env;
}

const ctxFor = (db: unknown): ToolContext =>
  ({ db, uid: 'u1', email: EMAIL, grantId: 'g' }) as unknown as ToolContext;

async function connect(db: unknown) {
  const server = new McpServer({ name: 't', version: '1' });
  registerWebTourTools(server, ctxFor(db));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return async (name: string, args: Data): Promise<Data> => {
    const res = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { type: string; text?: string; mimeType?: string }[];
    };
    const text = res.content.find((c) => c.type === 'text')?.text ?? '';
    if (res.isError) return { error: text };
    return {
      ...(JSON.parse(text) as Data),
      images: res.content.filter((c) => c.type === 'image'),
    };
  };
}

beforeEach(() => {
  h.flags = new Set(['claude-connector-guided-learning', 'web-tours']);
  h.files.clear();
});

describe('web tour connector tools', () => {
  it('lists web drafts with their publish state', async () => {
    const { db } = seed({
      'building_web_tours/t2': { ...tour(), title: 'Other', updatedAt: 30 },
      'building_guided_learning_tours/t2': { surface: 'web', publishedAt: 20 },
    });
    const call = await connect(db);
    const out = (await call('list_web_tours', {})) as {
      web_tours: Data[];
    };
    expect(out.web_tours.map((t) => [t.set_id, t.publish_state])).toEqual([
      ['t2', 'changed'],
      ['t1', 'draft'],
    ]);
    expect(out.web_tours[1].step_count).toBe(2);
  });

  it('returns each step without the CSS selector or box', async () => {
    const call = await connect(seed().db);
    const out = (await call('get_web_tour', { set_id: 't1' })) as {
      steps: Data[];
    };
    expect(out.steps[0]).toEqual({
      id: 'a',
      number: 1,
      title: 'Click Gradebook',
      tip: '',
      action: 'click',
      url_pattern: 'https://lms.example.com/course/*',
      locator: { role: 'link', name: 'Gradebook', text: 'Gradebook' },
      has_picture: true,
    });
    expect(out.steps[1].has_picture).toBe(false);
    expect(JSON.stringify(out)).not.toContain('nth-child');
  });

  it('returns the goal, each note and question, and the newer clues', async () => {
    const env = seed();
    const doc = env.docs.get('building_web_tours/t1') as Data;
    env.docs.set('building_web_tours/t1', {
      ...doc,
      webGoal: 'Posting a grade',
      steps: [
        {
          ...STEP_A,
          web: {
            ...STEP_A.web,
            note: 'starts every grading run',
            claudeQuestion: 'Which course?',
            locator: {
              ...STEP_A.web.locator,
              heading: 'Course tools',
              pageTitle: 'Biology',
              attrs: { testId: 'gradebook-link', href: '/course/*/grades' },
            },
          },
        },
        STEP_B,
      ],
    });
    const call = await connect(env.db);
    const out = (await call('get_web_tour', { set_id: 't1' })) as Data & {
      steps: Data[];
    };
    expect(out.goal).toBe('Posting a grade');
    expect(out.steps[0]).toMatchObject({
      note: 'starts every grading run',
      question: 'Which course?',
      locator: {
        role: 'link',
        name: 'Gradebook',
        text: 'Gradebook',
        heading: 'Course tools',
        pageTitle: 'Biology',
        attrs: { testId: 'gradebook-link', href: '/course/*/grades' },
      },
    });
    expect(out.steps[1]).not.toHaveProperty('note');
  });

  it('returns suggested fixes read-only: a check run, or teacher runs that agree (C14, C16)', async () => {
    const fix = {
      role: 'link',
      name: 'Jane Smith',
      pageTitle: 'Smith, Jane - Grades',
      css: '#nav > a.grades',
    };
    const run = (over: Data): Data => ({
      v: 20,
      startedAt: 5,
      furthest: 1,
      done: false,
      surface: 'web',
      misses: ['a', 'b'],
      weak: [],
      fixes: { a: fix, b: { text: 'Grades view' } },
      ...over,
    });
    const env = seed({
      'building_guided_learning_tours/t1': {
        surface: 'web',
        publishedAt: 20,
        set: { steps: [STEP_A, STEP_B] },
      },
      'building_guided_learning_tours/t1/runs/u2': run({}),
      'building_guided_learning_tours/t1/runs/u3': run({
        fixes: { a: fix },
      }),
      'building_guided_learning_tours/t1/runs/u4': run({ v: 9 }),
    });
    const call = await connect(env.db);
    const out = (await call('get_web_tour', { set_id: 't1' })) as {
      steps: Data[];
    };
    // A teacher's page words and title never reach Claude: the step's own words stay (C15).
    expect(out.steps[0].suggested_fix).toEqual({
      locator: { role: 'link', name: 'Gradebook', text: 'Gradebook' },
      changed: ['page position'],
      source: 'teacher',
      runs: 2,
      found_at: expect.any(String) as unknown,
    });
    // One teacher run is not enough.
    expect(out.steps[1]).not.toHaveProperty('suggested_fix');
    expect(JSON.stringify(out)).not.toContain('a.grades');
    expect(JSON.stringify(out)).not.toMatch(/Jane|Smith|Grades view/);

    const doc = env.docs.get('building_web_tours/t1') as Data;
    env.docs.set('building_web_tours/t1', {
      ...doc,
      webSuggestions: {
        b: {
          locator: { text: 'Grades view', attrs: { testId: 'grades' } },
          source: 'check',
          count: 1,
          at: 7,
          base: fixKey(STEP_B.web.locator),
        },
      },
      webFixDismissed: { a: fixKey(runFixClues(fix, STEP_A.web.locator)) },
    });
    const next = (await call('get_web_tour', { set_id: 't1' })) as {
      steps: Data[];
    };
    expect(next.steps[0]).not.toHaveProperty('suggested_fix');
    // A check's new words stay in SpartBoard; Claude reads only the site's own clues.
    expect(next.steps[1].suggested_fix).toMatchObject({
      source: 'check',
      locator: { text: 'Grades', attrs: { testId: 'grades' } },
      changed: ['control id'],
    });
    expect(JSON.stringify(next)).not.toContain('Grades view');

    // A later check that found the step clearly hides the check's fix.
    env.docs.set('building_web_tours/t1', {
      ...(env.docs.get('building_web_tours/t1') as Data),
      webTourChecked: { by: 'u1', at: 9, sig: 'x', results: { b: 'found' } },
    });
    const later = (await call('get_web_tour', { set_id: 't1' })) as {
      steps: Data[];
    };
    expect(later.steps[1]).not.toHaveProperty('suggested_fix');

    // update_web_tour_text never touches a locator or the suggestions.
    const kept = (env.docs.get('building_web_tours/t1') as Data).webSuggestions;
    await call('update_web_tour_text', {
      set_id: 't1',
      steps: [{ id: 'a', tip: 'New tip' }],
    });
    const saved = env.docs.get('building_web_tours/t1') as Data & {
      steps: (typeof STEP_A)[];
      webSuggestions: unknown;
    };
    expect(saved.steps[0].web.locator).toEqual(STEP_A.web.locator);
    expect(saved.webSuggestions).toEqual(kept);
    expect(saved.steps[0]).toMatchObject({ text: 'New tip' });
    expect(saved.webFixDismissed).toEqual({
      a: fixKey(runFixClues(fix, STEP_A.web.locator)),
    });
  });

  it('offers no tool that applies a fix', () => {
    expect([...WEB_TOUR_TOOLS].some((t) => /fix|locator|target/.test(t))).toBe(
      false
    );
  });

  it("clears a step's Claude question once words are written for it", () => {
    const asked = {
      ...STEP_A,
      web: { ...STEP_A.web, claudeQuestion: 'Which course?' },
    };
    const { steps } = applyWebStepText(
      [asked, { ...STEP_B, web: { ...STEP_B.web, claudeQuestion: 'Why?' } }],
      [
        { id: 'a', tip: 'Opens the gradebook.' },
        { id: 'b', title: '' },
      ]
    );
    expect(steps[0].web).not.toHaveProperty('claudeQuestion');
    expect(steps[1].web).toHaveProperty('claudeQuestion', 'Why?');
  });

  it('stays published when only the goal, notes or questions changed', () => {
    const published = { at: 10, set: tour() };
    const draft = {
      ...tour(),
      updatedAt: 30,
      webGoal: 'New goal',
      steps: [
        { ...STEP_A, web: { ...STEP_A.web, note: 'n', claudeQuestion: 'q' } },
        STEP_B,
      ],
    };
    expect(publishState(draft, published)).toBe('published');
    expect(publishState({ ...draft, steps: [STEP_B, STEP_A] }, published)).toBe(
      'changed'
    );
    expect(publishState({ ...tour(), updatedAt: 5 }, published)).toBe(
      'published'
    );
    expect(publishState(tour(), null)).toBe('draft');
  });

  it('is for admins only, with the web-tours flag on', async () => {
    let call = await connect(seed({}, false).db);
    for (const [name, args] of [
      ['list_web_tours', {}],
      ['get_web_tour', { set_id: 't1' }],
      ['update_web_tour_text', { set_id: 't1', title: 'New' }],
    ] as const)
      expect(await call(name, args)).toMatchObject({
        error: matching(/admins/),
      });
    h.flags.delete('web-tours');
    call = await connect(seed().db);
    expect(await call('get_web_tour', { set_id: 't1' })).toMatchObject({
      error: matching(/Web tours are not turned on/),
    });
    expect(env.docs.get('building_web_tours/t1')?.title).toBe(
      'Find the gradebook'
    );
  });

  it('hides the web tour tools from teachers', async () => {
    const { hiddenToolsFor } = await import('./tools');
    const teacher = await hiddenToolsFor(ctxFor(seed({}, false).db));
    const adminHidden = await hiddenToolsFor(ctxFor(seed().db));
    for (const t of WEB_TOUR_TOOLS) {
      expect(teacher.has(t)).toBe(true);
      expect(adminHidden.has(t)).toBe(false);
    }
  });

  it('refuses a SpartBoard set, or a draft that is not a web tour', async () => {
    const call = await connect(
      seed({ 'building_web_tours/odd': { ...tour(), surface: 'spartboard' } })
        .db
    );
    for (const set_id of ['live1', 'odd'])
      expect(await call('get_web_tour', { set_id })).toMatchObject({
        error: matching(/not a web tour/),
      });
    expect(await call('get_web_tour', { set_id: 'nope' })).toMatchObject({
      error: matching(/No web tour has that set_id/),
    });
    expect(
      await call('update_web_tour_text', { set_id: 'live1', title: 'X' })
    ).toMatchObject({ error: matching(/not a web tour/) });
  });

  it('changes only titles and tips, keeping every recorded field', async () => {
    const call = await connect(seed().db);
    const out = await call('update_web_tour_text', {
      set_id: 't1',
      title: 'Open the gradebook',
      steps: [
        { id: 'a', title: 'Open Gradebook', tip: 'It is in the left menu.' },
        { id: 'b', tip: '' },
      ],
    });
    expect(out).toMatchObject({
      title: 'Open the gradebook',
      previous_version_revision_id: expect.any(String) as unknown,
    });
    const saved = env.docs.get('building_web_tours/t1') as Data & {
      steps: Data[];
    };
    const before = tour() as Data & { steps: Data[] };
    expect(saved.steps.map((s) => s.id)).toEqual(['a', 'b']);
    expect(saved.steps[0]).toEqual({
      ...STEP_A,
      label: 'Open Gradebook',
      text: 'It is in the left menu.',
    });
    expect(saved.steps[1]).toEqual({ ...STEP_B, text: '' });
    for (const key of ['surface', 'mode', 'webPicturesChecked'])
      expect(saved[key]).toEqual(before[key]);
    expect(saved.updatedAt).toBeGreaterThan(10);
  });

  it('takes no other step field', async () => {
    const call = await connect(seed().db);
    for (const extra of [
      { locator: { css: 'x' } },
      { web: { action: 'type' } },
      { action: 'type' },
      { url_pattern: 'https://evil.example' },
      { label: 'x' },
    ])
      expect(
        await call('update_web_tour_text', {
          set_id: 't1',
          steps: [{ id: 'a', ...extra }],
        })
      ).toHaveProperty('error');
    expect(env.docs.get('building_web_tours/t1')).toEqual(tour());
  });

  it('enforces the editor limits and refuses unknown or repeated ids', async () => {
    const call = await connect(seed().db);
    for (const steps of [
      [{ id: 'a', tip: 'x'.repeat(501) }],
      [{ id: 'a', title: 'x'.repeat(201) }],
      [{ id: 'zzz', tip: 'Hi' }],
      [
        { id: 'a', tip: 'Hi' },
        { id: 'a', tip: 'There' },
      ],
    ])
      expect(
        await call('update_web_tour_text', { set_id: 't1', steps })
      ).toHaveProperty('error');
    expect(
      await call('update_web_tour_text', { set_id: 't1', title: '' })
    ).toHaveProperty('error');
    expect(await call('update_web_tour_text', { set_id: 't1' })).toHaveProperty(
      'error'
    );
    expect(env.docs.get('building_web_tours/t1')).toEqual(tour());
  });

  it('refuses student data and warns on a possible name', async () => {
    const call = await connect(seed().db);
    for (const tip of [
      'Email jane.doe@school.org for help',
      'Student 4821937',
      'Open 0f8fad5b-d9cb-469f-a165-70867728950e',
    ])
      expect(
        await call('update_web_tour_text', {
          set_id: 't1',
          steps: [{ id: 'b', tip }],
        })
      ).toMatchObject({ error: matching(/student data/) });
    expect(
      await call('update_web_tour_text', {
        set_id: 't1',
        title: 'Grades for jane@school.org',
      })
    ).toMatchObject({ error: matching(/student data/) });
    expect(env.docs.get('building_web_tours/t1')).toEqual(tour());
    const out = await call('update_web_tour_text', {
      set_id: 't1',
      steps: [{ id: 'b', tip: 'Find Smith, Jane in the list.' }],
    });
    expect(out.warnings).toEqual([matching(/Last, First/)]);
  });

  it('refuses to overwrite an editor save made after the read', async () => {
    const { db, bump } = seed();
    const realBatch = db.batch;
    db.batch = () => {
      bump('building_web_tours/t1');
      return realBatch();
    };
    const call = await connect(db);
    expect(
      await call('update_web_tour_text', { set_id: 't1', title: 'New' })
    ).toMatchObject({ error: matching(/Fetch it again/) });
  });

  it("returns a step's picture from Storage, only from the tour's folder", async () => {
    h.files.set('web_tour_pictures/t1/p1.jpg', {
      bytes: Buffer.from('jpg'),
      contentType: 'image/jpeg',
    });
    const t = tour() as Data & { steps: Data[] };
    const stray = {
      ...STEP_B,
      id: 'c',
      web: {
        ...STEP_B.web,
        picture: { path: 'web_tour_pictures/other/p.jpg', w: 1, h: 1 },
      },
    };
    const call = await connect(
      seed({ 'building_web_tours/t1': { ...t, steps: [...t.steps, stray] } }).db
    );
    const out = await call('get_web_tour_step_picture', {
      set_id: 't1',
      step_id: 'a',
    });
    expect(out.images).toEqual([
      containing({
        mimeType: 'image/jpeg',
        data: Buffer.from('jpg').toString('base64'),
      }),
    ]);
    expect(
      await call('get_web_tour_step_picture', { set_id: 't1', step_id: 'b' })
    ).toMatchObject({ error: matching(/no recorded picture/) });
    expect(
      await call('get_web_tour_step_picture', { set_id: 't1', step_id: 'c' })
    ).toMatchObject({ error: matching(/outside/) });
    expect(isWebTourPicturePath('t1', 'web_tour_pictures/t1/../x')).toBe(false);
  });

  it('restores the old titles and tips from the revision it kept', async () => {
    const call = await connect(seed().db);
    const out = await call('update_web_tour_text', {
      set_id: 't1',
      title: 'Renamed',
      steps: [{ id: 'b', tip: 'New tip' }],
    });
    const revPath = `users/u1/claude_revisions/${String(out.previous_version_revision_id)}`;
    const rev = env.docs.get(revPath) as Data;
    const snap = {
      get: (k: string) => rev[k],
    } as unknown as admin.firestore.DocumentSnapshot;
    await restoreWebTourRevision(ctxFor(env.db), snap);
    const saved = env.docs.get('building_web_tours/t1') as Data;
    expect({ ...saved, updatedAt: 10 }).toEqual(tour());
  });

  it('matches hard and soft student data patterns', () => {
    expect([...webTourTextHits('Call (612) 555-1234')]).toEqual(['id-number']);
    expect([...webTourTextHits('Open Gradebook')]).toEqual([]);
  });
});

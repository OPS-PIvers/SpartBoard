import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ToolContext } from './activity';
import { hiddenToolsFor, registerTools } from './tools';
import { SPEAK_G2P_VERSION } from '../pronunciation/lookup';

const mocks = vi.hoisted(() => ({
  speakGranted: vi.fn(() => Promise.resolve(false)),
  compute: vi.fn(),
  isAdmin: vi.fn(),
  resultsOn: vi.fn(),
  restores: {
    quiz: vi.fn(),
    video: vi.fn(),
    rubric: vi.fn(),
    wall: vi.fn(),
    miniApp: vi.fn(),
    gl: vi.fn(),
  },
}));

vi.mock('./quizTools', () => ({
  registerQuizTools: vi.fn(),
  restoreQuizRevision: mocks.restores.quiz,
}));
vi.mock('./videoTools', () => ({
  registerVideoTools: vi.fn(),
  restoreVideoRevision: mocks.restores.video,
}));
vi.mock('./rubricTools', () => ({
  registerRubricTools: vi.fn(),
  restoreRubricRevision: mocks.restores.rubric,
}));
vi.mock('./wallTools', () => ({
  registerWallTools: vi.fn(),
  restoreWallRevision: mocks.restores.wall,
}));
vi.mock('./miniAppTools', () => ({
  registerMiniAppTools: vi.fn(),
  restoreMiniAppRevision: mocks.restores.miniApp,
  miniAppResultsOn: mocks.resultsOn,
}));
vi.mock('./resultsTools', () => ({ registerResultsTools: vi.fn() }));
vi.mock('../quizMediaArchive', () => ({
  isGlobalFeatureGranted: mocks.speakGranted,
}));
vi.mock('../pronunciation/lookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pronunciation/lookup')>()),
  computeSpeakReferences: mocks.compute,
}));
vi.mock('./glTools', () => ({
  registerGuidedLearningTools: vi.fn(),
  restoreGuidedLearningRevision: mocks.restores.gl,
  isAdmin: mocks.isAdmin,
}));
vi.mock('./glCreate', () => ({ registerCreateGuidedLearning: vi.fn() }));
vi.mock('./glLiveTour', () => ({
  ADMIN_ONLY_TOOLS: new Set(['create_live_tour', 'get_live_tour']),
  registerLiveTourTools: vi.fn(),
}));
vi.mock('./meetingTools', () => ({ registerMeetingTools: vi.fn() }));
vi.mock('./standardsTools', () => ({ registerStandardsTools: vi.fn() }));

type Data = Record<string, unknown>;

function fakeDb(seed: Record<string, Data> = {}) {
  const docs = new Map(Object.entries(seed));
  let seq = 0;
  const snap = (path: string) => ({
    id: path.split('/').pop(),
    ref: { path },
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
      where: () => ({
        get: () => Promise.resolve({ empty: true, size: 0, docs: [] }),
      }),
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
              Number(b.data()?.updatedAt ?? b.data()?.createdAt ?? 0) -
              Number(a.data()?.updatedAt ?? a.data()?.createdAt ?? 0)
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
  registerTools(server, ctxFor(db));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return async (name: string, args: Data = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    const text = res.content[0].text;
    return res.isError ? { error: text } : (JSON.parse(text) as Data);
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const setPath = (id: string) => `users/u1/flashcard_sets/${id}`;
const card = (n: number) => ({ term: `Term ${n}`, definition: `Def ${n}` });

beforeEach(() => {
  mocks.isAdmin.mockReset();
  mocks.resultsOn.mockReset();
  Object.values(mocks.restores).forEach((fn) => fn.mockReset());
  mocks.resultsOn.mockResolvedValue(false);
});

describe('get_my_account', () => {
  it('reports the teacher, limits and the results wording when results are off', async () => {
    const call = await connect(fakeDb().db);
    const res = await call('get_my_account');
    expect(res.email).toBe('u1@example.org');
    expect(res.name).toBeNull();
    expect(res.daily_change_limit).toBe(300);
    expect(res.can).toContain('class-level quiz and video activity results');
  });

  it('names mini-app results when they are on, and survives the check failing', async () => {
    mocks.resultsOn.mockResolvedValue(true);
    const on = await (await connect(fakeDb().db))('get_my_account');
    expect(on.can).toContain(
      'class-level quiz, video activity and mini-app results'
    );
    mocks.resultsOn.mockRejectedValue(new Error('boom'));
    const failed = await (await connect(fakeDb().db))('get_my_account');
    expect(failed.can).toContain('class-level quiz and video activity results');
  });
});

describe('list_folders / create_folder', () => {
  const folder = (name: string, parentId: string | null, order = 0) => ({
    name,
    parentId,
    order,
  });

  it('lists folders with their path, sorted by path', async () => {
    const { db } = fakeDb({
      'users/u1/flashcard_folders/b': folder('Unit 2', null),
      'users/u1/flashcard_folders/a': folder('Unit 1', null),
      'users/u1/flashcard_folders/c': folder('Week 1', 'a'),
    });
    const res = await (
      await connect(db)
    )('list_folders', {
      content_type: 'flashcards',
    });
    expect((res.folders as { path: string }[]).map((f) => f.path)).toEqual([
      'Unit 1',
      'Unit 1 / Week 1',
      'Unit 2',
    ]);
  });

  it('creates a top-level folder, logs it and counts one write', async () => {
    const { db, docs } = fakeDb();
    const res = await (
      await connect(db)
    )('create_folder', {
      content_type: 'flashcards',
      name: ' Vocab ',
      color: 'blue',
    });
    expect(res).toMatchObject({
      name: 'Vocab',
      path: 'Vocab',
      parent_folder_id: null,
      color: 'blue',
    });
    expect(
      docs.get(`users/u1/flashcard_folders/${res.folder_id as string}`)
    ).toMatchObject({ name: 'Vocab', order: 0, color: 'blue' });
    expect(
      [...docs.entries()].find(([k]) =>
        k.startsWith('users/u1/claude_activity/')
      )?.[1]
    ).toMatchObject({ action: 'create', itemType: 'folder' });
    expect(docs.get(`users/u1/claude_usage/${today()}`)).toMatchObject({
      writes: 1,
    });
  });

  it('reuses existing parent_path folders and creates only the missing ones', async () => {
    const { db, docs } = fakeDb({
      'users/u1/flashcard_folders/a': folder('Unit 3', null),
    });
    const res = await (
      await connect(db)
    )('create_folder', {
      content_type: 'flashcards',
      name: 'Quiz Prep',
      parent_path: ['unit 3', 'Week 2'],
    });
    expect(res.path).toBe('Unit 3 / Week 2 / Quiz Prep');
    expect(res.parent_folders_created).toEqual(['Week 2']);
    const created = [...docs.keys()].filter((k) =>
      k.startsWith('users/u1/flashcard_folders/')
    );
    expect(created).toHaveLength(3);
    expect(docs.get(`users/u1/claude_usage/${today()}`)).toMatchObject({
      writes: 2,
    });
  });

  it('rejects an unknown parent_folder_id without writing', async () => {
    const { db, docs } = fakeDb();
    const res = await (
      await connect(db)
    )('create_folder', {
      content_type: 'flashcards',
      name: 'X',
      parent_folder_id: 'nope',
    });
    expect(res.error).toMatch(/Folder nope was not found/);
    expect(docs.size).toBe(0);
  });

  it('rejects a blank name and an unknown color at the schema', async () => {
    const call = await connect(fakeDb().db);
    expect(
      await call('create_folder', { content_type: 'flashcards', name: '  ' })
    ).toHaveProperty('error');
    expect(
      await call('create_folder', {
        content_type: 'flashcards',
        name: 'X',
        color: 'purple',
      })
    ).toHaveProperty('error');
  });
});

describe('create_flashcard_set', () => {
  it('saves a normalized set marked for review, logs it and counts a write', async () => {
    const { db, docs } = fakeDb();
    const res = await (
      await connect(db)
    )('create_flashcard_set', {
      title: ' Cells ',
      cards: [card(1), card(2)],
    });
    expect(res).toMatchObject({
      title: 'Cells',
      card_count: 2,
      folder_id: null,
      where_to_find_it: 'SpartBoard > Flashcards widget > library',
    });
    const saved = docs.get(setPath(res.set_id as string)) as Data;
    expect(saved).toMatchObject({
      title: 'Cells',
      termLanguage: 'en-US',
      definitionLanguage: 'en-US',
      folderId: null,
    });
    expect(saved.claudeReviewPendingAt).toEqual(expect.any(Number));
    expect(saved.claudeCreatedAt).toEqual(expect.any(Number));
    expect(
      (saved.cards as { id: string }[]).every((c) => c.id.length > 0)
    ).toBe(true);
    expect(
      [...docs.entries()].find(([k]) =>
        k.startsWith('users/u1/claude_activity/')
      )?.[1]
    ).toMatchObject({ action: 'create', itemType: 'flashcard_set' });
    expect(docs.get(`users/u1/claude_usage/${today()}`)).toMatchObject({
      writes: 1,
    });
  });

  it('rejects an unknown folder without writing', async () => {
    const { db, docs } = fakeDb();
    const res = await (
      await connect(db)
    )('create_flashcard_set', {
      title: 'T',
      folder_id: 'nope',
      cards: [card(1)],
    });
    expect(res.error).toMatch(/Folder nope was not found/);
    expect(docs.size).toBe(0);
  });

  it('fails schema validation for no cards, a blank title or a bad language', async () => {
    const call = await connect(fakeDb().db);
    expect(
      await call('create_flashcard_set', { title: 'T', cards: [] })
    ).toHaveProperty('error');
    expect(
      await call('create_flashcard_set', { title: ' ', cards: [card(1)] })
    ).toHaveProperty('error');
    expect(
      await call('create_flashcard_set', {
        title: 'T',
        term_language: 'not a language',
        cards: [card(1)],
      })
    ).toHaveProperty('error');
  });

  it('stops at the daily write cap', async () => {
    const { db, docs } = fakeDb({
      [`users/u1/claude_usage/${today()}`]: { writes: 300 },
    });
    const res = await (
      await connect(db)
    )('create_flashcard_set', {
      title: 'T',
      cards: [card(1)],
    });
    expect(res.error).toMatch(/Daily limit/);
    expect([...docs.keys()].some((k) => k.includes('flashcard_sets'))).toBe(
      false
    );
  });
});

describe('flashcard Speak (S10)', () => {
  const ref = (dialect: string) => ({
    dialect,
    tokens: ['o', 'l', 'a'],
    stress: [0],
  });
  // Echoes each term; a term containing "?" comes back flagged for the teacher.
  const fakeLookup = (input: {
    dialects: string[];
    terms: { cardId: string; term: string }[];
  }) =>
    Promise.resolve({
      g2pVersion: 'test',
      cards: Object.fromEntries(
        input.terms.map((t) => [
          t.cardId,
          {
            term: t.term,
            refs: input.dialects.map(ref),
            g2pVersion: SPEAK_G2P_VERSION,
            status: t.term.includes('?') ? 'needs-review' : 'ready',
            ...(t.term.includes('?') ? { reasons: ['g2p-disagree'] } : {}),
          },
        ])
      ),
    });
  const es = (term: string) => ({ term, definition: 'd' });

  beforeEach(() => {
    mocks.speakGranted.mockReset();
    mocks.speakGranted.mockResolvedValue(true);
    mocks.compute.mockReset();
    mocks.compute.mockImplementation(fakeLookup);
  });

  afterEach(() => {
    mocks.speakGranted.mockResolvedValue(false);
  });

  it('saves Speak settings from a level, looks up every card and reports cards to check', async () => {
    const { db, docs } = fakeDb({
      'admin_settings/flashcardsSpeak': { attempts: 4 },
    });
    const res = await (
      await connect(db)
    )('create_flashcard_set', {
      title: 'Animales',
      term_language: 'es-MX',
      cards: [es('perro'), es('l?bo')],
      speak: { level: 'intermediate', dialects: ['es-ES'], hear_it: false },
    });
    expect(res.speak).toMatchObject({
      cards_ready: 1,
      cards_to_check: 1,
      cards_unavailable: 0,
      note: expect.any(String) as string,
    });
    const saved = docs.get(setPath(res.set_id as string)) as Data;
    expect(saved.speak).toMatchObject({
      dialects: ['es-ES'],
      preset: 'intermediate',
      strict: false,
      attempts: 4,
      example: false,
    });
    expect((saved.speak as { groups: Data }).groups).toMatchObject({
      'es-trill': 'require',
      'es-soft-bdg': 'forgive',
    });
    const cards = saved.cards as { speak?: { status: string } }[];
    expect(cards.map((c) => c.speak?.status)).toEqual([
      'ready',
      'needs-review',
    ]);
    expect(mocks.compute).toHaveBeenCalledTimes(1);
  });

  it('looks up cards for a Speak language without writing settings', async () => {
    const { db, docs } = fakeDb();
    const res = await (
      await connect(db)
    )('create_flashcard_set', {
      title: 'Tiere',
      term_language: 'de-DE',
      cards: [es('Hund')],
    });
    const saved = docs.get(setPath(res.set_id as string)) as Data;
    expect(saved).not.toHaveProperty('speak');
    expect((saved.cards as { speak?: unknown }[])[0].speak).toMatchObject({
      refs: [ref('de-DE')],
    });
  });

  it('refuses Speak settings for an unsupported language or without the flag', async () => {
    const { db, docs } = fakeDb();
    const call = await connect(db);
    expect(
      (
        await call('create_flashcard_set', {
          title: 'Animaux',
          term_language: 'fr-FR',
          cards: [es('chien')],
          speak: { level: 'beginner' },
        })
      ).error
    ).toMatch(/Spanish, German or English/);
    mocks.speakGranted.mockResolvedValue(false);
    expect(
      (
        await call('create_flashcard_set', {
          title: 'Animales',
          term_language: 'es-MX',
          cards: [es('perro')],
          speak: { level: 'beginner' },
        })
      ).error
    ).toMatch(/not turned on/);
    expect([...docs.keys()].some((k) => k.includes('flashcard_sets'))).toBe(
      false
    );
  });

  it('runs no lookup without the flag', async () => {
    mocks.speakGranted.mockResolvedValue(false);
    const { db, docs } = fakeDb();
    const res = await (
      await connect(db)
    )('create_flashcard_set', {
      title: 'Animales',
      term_language: 'es-MX',
      cards: [es('perro')],
    });
    expect(mocks.compute).not.toHaveBeenCalled();
    expect(res).not.toHaveProperty('speak');
    expect((docs.get(setPath(res.set_id as string)) as Data).cards).toEqual([
      { id: expect.any(String) as string, term: 'perro', definition: 'd' },
    ]);
  });

  it('looks up only changed terms on an edit and keeps the set settings', async () => {
    const { db, docs } = fakeDb();
    const call = await connect(db);
    const made = await call('create_flashcard_set', {
      title: 'Animales',
      term_language: 'es-MX',
      cards: [es('perro'), es('gato')],
      speak: { attempts: 2 },
    });
    const id = made.set_id as string;
    const before = (docs.get(setPath(id)) as Data).cards as {
      id: string;
      term: string;
    }[];
    mocks.compute.mockClear();
    await call('update_flashcard_set', {
      set_id: id,
      cards: [
        { id: before[0].id, term: 'perro', definition: 'dog' },
        { id: before[1].id, term: 'gata', definition: 'cat' },
      ],
    });
    expect(mocks.compute).toHaveBeenCalledTimes(1);
    expect(
      (mocks.compute.mock.calls[0][0] as { terms: { term: string }[] }).terms
    ).toEqual([{ cardId: before[1].id, term: 'gata' }]);
    const saved = docs.get(setPath(id)) as Data;
    expect((saved.speak as Data).attempts).toBe(2);
    expect(
      (saved.cards as { speak?: { term: string } }[]).map((c) => c.speak?.term)
    ).toEqual(['perro', 'gata']);
  });

  it("returns each card's Speak status, not its references", async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    const made = await call('create_flashcard_set', {
      title: 'Animales',
      term_language: 'es-MX',
      cards: [es('l?bo')],
    });
    const res = await call('get_flashcard_set', {
      set_id: made.set_id as string,
    });
    expect((res.cards as Data[])[0]).toEqual({
      id: expect.any(String) as string,
      term: 'l?bo',
      definition: 'd',
      speak_status: 'needs-review',
      speak_reasons: ['g2p-disagree'],
    });
  });

  it('refuses accents from another language', async () => {
    const { db, docs } = fakeDb();
    const res = await (
      await connect(db)
    )('create_flashcard_set', {
      title: 'Tiere',
      term_language: 'de-DE',
      cards: [es('Hund')],
      speak: { dialects: ['es-ES'] },
    });
    expect(res.error).toMatch(/de-DE/);
    expect([...docs.keys()].some((k) => k.includes('flashcard_sets'))).toBe(
      false
    );
  });

  it('keeps a teacher confirmation when a re-lookup returns the same references', async () => {
    const cardSpeak = {
      term: 'l?bo',
      refs: [ref('es-419')],
      g2pVersion: 'old-engine',
      status: 'needs-review',
      reasons: ['g2p-disagree'],
      confirmedAt: 5,
    };
    const { db, docs } = fakeDb({
      [setPath('s1')]: {
        title: 'Animales',
        termLanguage: 'es-MX',
        definitionLanguage: 'en-US',
        speak: { dialects: ['es-419'] },
        cards: [{ id: 'c1', term: 'l?bo', definition: 'd', speak: cardSpeak }],
        createdAt: 1,
        updatedAt: 1,
      },
    });
    await (
      await connect(db)
    )('update_flashcard_set', {
      set_id: 's1',
      title: 'Animales 2',
    });
    expect(
      ((docs.get(setPath('s1')) as Data).cards as { speak?: Data }[])[0].speak
    ).toMatchObject({ g2pVersion: SPEAK_G2P_VERSION, confirmedAt: 5 });
  });

  it('marks cards when the lookup fails and retries them on the next save', async () => {
    const { db, docs } = fakeDb();
    const call = await connect(db);
    mocks.compute.mockRejectedValueOnce(new Error('espeak down'));
    const made = await call('create_flashcard_set', {
      title: 'Animales',
      term_language: 'es-MX',
      cards: [es('perro')],
    });
    const id = made.set_id as string;
    expect(made.speak).toMatchObject({ cards_unavailable: 1 });
    expect(
      ((docs.get(setPath(id)) as Data).cards as { speak?: Data }[])[0].speak
    ).toMatchObject({ status: 'unavailable', reasons: ['lookup-failed'] });
    await call('update_flashcard_set', { set_id: id, title: 'Animales 2' });
    expect(
      ((docs.get(setPath(id)) as Data).cards as { speak?: Data }[])[0].speak
    ).toMatchObject({ status: 'ready' });
  });
});

describe('read tools', () => {
  async function created() {
    const fx = fakeDb();
    const call = await connect(fx.db);
    const a = await call('create_flashcard_set', {
      title: 'Cells',
      cards: [card(1)],
    });
    return { ...fx, call, id: a.set_id as string };
  }

  it('get_flashcard_set returns the cards with ids', async () => {
    const { call, id } = await created();
    const res = await call('get_flashcard_set', { set_id: id });
    expect(res.title).toBe('Cells');
    expect(res.shared_publicly).toBe(false);
    expect(res.cards).toEqual([
      {
        id: expect.any(String) as string,
        term: 'Term 1',
        definition: 'Def 1',
      },
    ]);
  });

  it('get_flashcard_set reports an unknown id', async () => {
    const { call } = await created();
    expect((await call('get_flashcard_set', { set_id: 'x' })).error).toMatch(
      /not found/
    );
  });

  it('list_flashcard_sets filters by title and folder', async () => {
    const { call, docs, id } = await created();
    const hit = await call('list_flashcard_sets', { search: 'CELL' });
    expect((hit.sets as { set_id: string }[]).map((s) => s.set_id)).toEqual([
      id,
    ]);
    expect((await call('list_flashcard_sets', { search: 'zzz' })).sets).toEqual(
      []
    );
    expect(
      (await call('list_flashcard_sets', { folder_id: 'f1' })).sets
    ).toEqual([]);
    expect(
      (await call('list_flashcard_sets', { folder_id: 'root' })).sets
    ).toHaveLength(1);
    docs.set(setPath(id), {
      ...(docs.get(setPath(id)) as Data),
      folderId: 'f1',
    });
    expect(
      (await call('list_flashcard_sets', { folder_id: 'f1' })).sets
    ).toHaveLength(1);
  });
});

describe('update_flashcard_set', () => {
  async function created() {
    const fx = fakeDb();
    const call = await connect(fx.db);
    const a = await call('create_flashcard_set', {
      title: 'Cells',
      cards: [card(1), card(2)],
    });
    return { ...fx, call, id: a.set_id as string };
  }

  it('changes only passed fields and snapshots the previous version', async () => {
    const { call, id, docs } = await created();
    const before = docs.get(setPath(id)) as { cards: unknown[] };
    const res = await call('update_flashcard_set', {
      set_id: id,
      title: 'Cells 2',
    });
    expect(res).toMatchObject({
      title: 'Cells 2',
      card_count: 2,
      open_study_assignments_updated: 0,
    });
    expect((docs.get(setPath(id)) as Data).cards).toEqual(before.cards);
    const revId = res.previous_version_revision_id as string;
    expect(docs.get(`users/u1/claude_revisions/${revId}`)).toMatchObject({
      itemType: 'flashcard_set',
      itemId: id,
      title: 'Cells',
    });
  });

  it('keeps ids of cards sent back and replaces the rest', async () => {
    const { call, id, docs } = await created();
    const [first] = (docs.get(setPath(id)) as { cards: { id: string }[] })
      .cards;
    await call('update_flashcard_set', {
      set_id: id,
      cards: [
        { id: first.id, term: 'New term', definition: 'New def' },
        card(3),
      ],
    });
    const cards = (
      docs.get(setPath(id)) as { cards: { id: string; term: string }[] }
    ).cards;
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ id: first.id, term: 'New term' });
    expect(cards[1].id).not.toBe(first.id);
  });

  it('moves a set into a folder and back to the top level with null', async () => {
    const { call, id, docs } = await created();
    docs.set('users/u1/flashcard_folders/f1', { name: 'F', parentId: null });
    await call('update_flashcard_set', { set_id: id, folder_id: 'f1' });
    expect((docs.get(setPath(id)) as Data).folderId).toBe('f1');
    await call('update_flashcard_set', { set_id: id, folder_id: null });
    expect((docs.get(setPath(id)) as Data).folderId).toBeNull();
  });

  it('reports an unknown set and an unknown folder', async () => {
    const { call, id } = await created();
    expect(
      (await call('update_flashcard_set', { set_id: 'x', title: 'T' })).error
    ).toMatch(/Flashcard set x was not found/);
    expect(
      (await call('update_flashcard_set', { set_id: id, folder_id: 'nope' }))
        .error
    ).toMatch(/Folder nope/);
  });

  it('stops at the daily write cap', async () => {
    const { call, id, docs } = await created();
    docs.set(`users/u1/claude_usage/${today()}`, { writes: 300 });
    expect(
      (await call('update_flashcard_set', { set_id: id, title: 'X' })).error
    ).toMatch(/Daily limit/);
  });
});

describe('list_revisions', () => {
  const revision = (itemId: string, createdAt: number) => ({
    itemType: 'flashcard_set',
    itemId,
    title: `Title ${itemId}`,
    createdAt,
  });

  it('lists revisions newest first and filters by item_id', async () => {
    const { db } = fakeDb({
      'users/u1/claude_revisions/r1': revision('a', 1000),
      'users/u1/claude_revisions/r2': revision('b', 3000),
      'users/u1/claude_revisions/r3': revision('a', 2000),
    });
    const call = await connect(db);
    const all = await call('list_revisions');
    expect(
      (all.revisions as { revision_id: string }[]).map((r) => r.revision_id)
    ).toEqual(['r2', 'r3', 'r1']);
    const only = await call('list_revisions', { item_id: 'a' });
    expect(
      (only.revisions as { revision_id: string }[]).map((r) => r.revision_id)
    ).toEqual(['r3', 'r1']);
    expect((only.revisions as { saved_at: string }[])[0].saved_at).toBe(
      new Date(2000).toISOString()
    );
  });
});

describe('restore_revision', () => {
  const rev = (itemType: string, itemId = 'a1', data: Data = {}) => ({
    itemType,
    itemId,
    title: 'Old',
    data,
    createdAt: 1,
  });

  it('reports a missing or expired revision', async () => {
    const res = await (
      await connect(fakeDb().db)
    )('restore_revision', {
      revision_id: 'gone',
    });
    expect(res.error).toMatch(/not found or has expired/);
  });

  it.each([
    ['quiz', 'quiz'],
    ['question_bank', 'quiz'],
    ['video_activity', 'video'],
    ['rubric', 'rubric'],
    ['activity_wall', 'wall'],
    ['mini_app', 'miniApp'],
    ['guided_learning', 'gl'],
  ] as const)('hands a %s revision to its own restorer', async (type, key) => {
    mocks.restores[key].mockResolvedValue({ restored: type });
    const { db } = fakeDb({ 'users/u1/claude_revisions/r1': rev(type) });
    const res = await (
      await connect(db)
    )('restore_revision', {
      revision_id: 'r1',
    });
    expect(res).toEqual({ restored: type });
    expect(mocks.restores[key]).toHaveBeenCalledTimes(1);
    const others = Object.entries(mocks.restores).filter(([k]) => k !== key);
    others.forEach(([, fn]) => expect(fn).not.toHaveBeenCalled());
  });

  it('refuses an item type it cannot restore', async () => {
    const { db } = fakeDb({ 'users/u1/claude_revisions/r1': rev('folder') });
    const res = await (
      await connect(db)
    )('restore_revision', {
      revision_id: 'r1',
    });
    expect(res.error).toBe('That revision cannot be restored.');
  });

  it('refuses to restore a flashcard set that was deleted', async () => {
    const { db } = fakeDb({
      'users/u1/claude_revisions/r1': rev('flashcard_set', 'gone'),
    });
    const res = await (
      await connect(db)
    )('restore_revision', {
      revision_id: 'r1',
    });
    expect(res.error).toMatch(/no longer exists/);
  });

  it('restores an old flashcard set, keeps the live share link and snapshots the current one', async () => {
    const fx = fakeDb();
    const call = await connect(fx.db);
    const made = await call('create_flashcard_set', {
      title: 'Original',
      cards: [card(1)],
    });
    const id = made.set_id as string;
    const original = { ...(fx.docs.get(setPath(id)) as Data) };
    const edited = await call('update_flashcard_set', {
      set_id: id,
      title: 'Edited',
    });
    fx.docs.set(setPath(id), {
      ...(fx.docs.get(setPath(id)) as Data),
      publicShareId: 'live-share',
    });
    const res = await call('restore_revision', {
      revision_id: edited.previous_version_revision_id as string,
    });
    expect(res.title).toBe('Original');
    expect(res.previous_version_revision_id).not.toBe(
      edited.previous_version_revision_id
    );
    expect(fx.docs.get(setPath(id))).toMatchObject({
      title: 'Original',
      cards: original.cards,
      publicShareId: 'live-share',
    });
    expect(fx.docs.get('public_flashcard_sets/live-share')).toMatchObject({
      setId: id,
      title: 'Original',
    });
    expect(
      [...fx.docs.values()].some(
        (d) => d.action === 'restore' && d.itemType === 'flashcard_set'
      )
    ).toBe(true);
  });
});

describe('hiddenToolsFor', () => {
  it('hides admin-only and results-only tools from a plain teacher', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    mocks.resultsOn.mockResolvedValue(false);
    const hidden = await hiddenToolsFor(ctxFor(fakeDb().db));
    expect([...hidden].sort()).toEqual([
      'create_live_tour',
      'get_live_tour',
      'get_mini_app_results_summary',
      'get_mini_app_spec',
    ]);
  });

  it('shows admin tools to admins and results tools when results are on', async () => {
    mocks.isAdmin.mockResolvedValue(true);
    mocks.resultsOn.mockResolvedValue(true);
    expect((await hiddenToolsFor(ctxFor(fakeDb().db))).size).toBe(0);
  });

  it('fails closed when either check throws', async () => {
    mocks.isAdmin.mockRejectedValue(new Error('boom'));
    mocks.resultsOn.mockRejectedValue(new Error('boom'));
    const hidden = await hiddenToolsFor(ctxFor(fakeDb().db));
    expect(hidden.has('create_live_tour')).toBe(true);
    expect(hidden.has('get_mini_app_spec')).toBe(true);
  });
});

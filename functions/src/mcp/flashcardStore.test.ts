import { describe, expect, it } from 'vitest';
import type { Timestamp } from 'firebase-admin/firestore';
import {
  MAX_CARDS,
  MAX_TERM,
  mergeCards,
  guardPublicShare,
  normalizeSet,
  rewriteOpenStudySessions,
  stageSetWrite,
  type ShareGuard,
  type FlashcardSet,
} from './flashcardStore';

const base: FlashcardSet = {
  id: 's1',
  title: '  Cells ',
  description: ' d ',
  termLanguage: ' ',
  definitionLanguage: 'es-MX',
  cards: [],
  createdAt: 1,
  updatedAt: 1,
};

const OWNED_TIME = { seconds: 5 } as unknown as Timestamp;
const OWNED: ShareGuard = { exists: true, updateTime: OWNED_TIME };

interface Call {
  op: 'set' | 'update' | 'create';
  path: unknown;
  data: unknown;
  extra?: unknown;
}

function recorder() {
  const calls: Call[] = [];
  const db = { doc: (path: string) => path } as unknown as Parameters<
    typeof stageSetWrite
  >[0];
  const log =
    (op: Call['op']) => (path: unknown, data: unknown, extra?: unknown) =>
      calls.push({ op, path, data, extra });
  const batch = {
    set: log('set'),
    update: log('update'),
    create: log('create'),
  } as unknown as Parameters<typeof stageSetWrite>[1];
  return { db, batch, calls };
}

describe('normalizeSet', () => {
  it('trims, defaults languages and caps cards like the client', () => {
    const cards = Array.from({ length: MAX_CARDS + 3 }, (_, i) => ({
      id: `c${i}`,
      term: 't'.repeat(MAX_TERM + 10),
      definition: 'd',
    }));
    const out = normalizeSet({ ...base, cards }, 99);
    expect(out.title).toBe('Cells');
    expect(out.description).toBe('d');
    expect(out.termLanguage).toBe('en-US');
    expect(out.definitionLanguage).toBe('es-MX');
    expect(out.cards).toHaveLength(MAX_CARDS);
    expect(out.cards[0].term).toHaveLength(MAX_TERM);
    expect(out.folderId).toBeNull();
    expect(out.updatedAt).toBe(99);
  });
});

describe('mergeCards', () => {
  it('keeps known ids once and mints ids for new or unknown cards', () => {
    const existing = [{ id: 'a', term: 'x', definition: 'y' }];
    const out = mergeCards(existing, [
      { id: 'a', term: 'x2', definition: 'y2' },
      { id: 'a', term: 'dup', definition: 'dup' },
      { id: 'ghost', term: 'g', definition: 'g' },
      { term: 'n', definition: 'n' },
    ]);
    expect(out[0].id).toBe('a');
    expect(new Set(out.map((c) => c.id)).size).toBe(4);
    expect(out.map((c) => c.id)).not.toContain('ghost');
  });
});

describe('Speak carry-through', () => {
  const speak = { term: 'hola', refs: [], g2pVersion: 'v1', status: 'ready' };

  it('keeps card references only while the term is unchanged', () => {
    const existing = [
      { id: 'a', term: 'hola', definition: 'hi', speak },
      { id: 'b', term: 'perro', definition: 'dog', speak },
    ];
    const out = mergeCards(existing, [
      { id: 'a', term: 'hola', definition: 'hello' },
      { id: 'b', term: 'gato', definition: 'cat' },
    ]);
    expect(out[0].speak).toBe(speak);
    expect('speak' in out[1]).toBe(false);
  });

  it('carries set and card Speak through normalizeSet and adds nothing without it', () => {
    const settings = { dialects: ['es-419'], attempts: 3 };
    const out = normalizeSet({
      ...base,
      speak: settings,
      cards: [{ id: 'a', term: 'hola', definition: 'hi', speak }],
    });
    expect(out.speak).toBe(settings);
    expect(out.cards[0].speak).toBe(speak);
    const plain = normalizeSet({
      ...base,
      cards: [{ id: 'a', term: 'hola', definition: 'hi' }],
    });
    expect('speak' in plain).toBe(false);
    expect(Object.keys(plain.cards[0])).toEqual(['id', 'term', 'definition']);
  });

  it('leaves the snapshot Speak stamp to the teacher client', () => {
    const { db, batch, calls } = recorder();
    stageSetWrite(
      db,
      batch,
      'uid',
      { ...base, publicShareId: 'share' },
      undefined,
      undefined,
      OWNED
    );
    const snapshotCall = calls.find((c) => c.op === 'update');
    expect(snapshotCall?.path).toBe('public_flashcard_sets/share');
    expect(snapshotCall?.data).not.toHaveProperty('speak');
    expect(snapshotCall?.extra).toEqual({ lastUpdateTime: OWNED_TIME });
  });

  it('drops card references from another language', () => {
    const esSpeak = { ...speak, refs: [{ dialect: 'es-419', tokens: ['o'] }] };
    const out = normalizeSet({
      ...base,
      termLanguage: 'fr-FR',
      cards: [{ id: 'a', term: 'hola', definition: 'hi', speak: esSpeak }],
    });
    expect('speak' in out.cards[0]).toBe(false);
    const kept = normalizeSet({
      ...base,
      termLanguage: 'es-MX',
      cards: [{ id: 'a', term: 'hola', definition: 'hi', speak: esSpeak }],
    });
    expect(kept.cards[0].speak).toBe(esSpeak);
  });

  it('drops the snapshot stamp only when the term language changes', () => {
    const { db, batch, calls } = recorder();
    const shared = { ...base, termLanguage: 'fr-FR', publicShareId: 'share' };
    stageSetWrite(db, batch, 'uid', shared, 'fr-CA', undefined, OWNED);
    stageSetWrite(db, batch, 'uid', shared, 'es-US', undefined, OWNED);
    const [same, moved] = calls.filter((c) => c.op === 'update');
    expect(same.data).not.toHaveProperty('speak');
    expect(moved.data).toHaveProperty('speak');
  });

  it('keeps a session stamp for the same language and clears it otherwise', async () => {
    const updates: Array<[string, Record<string, unknown>]> = [];
    const sessions = [
      { id: 's-es', speak: { dialects: ['es-419'] } },
      { id: 's-fr', speak: { dialects: ['fr-FR'] } },
      { id: 's-none' },
    ];
    const query = {
      where: () => query,
      get: () =>
        Promise.resolve({
          empty: false,
          size: sessions.length,
          docs: sessions.map((data) => ({
            id: data.id,
            ref: data.id,
            get: (key: string) => (data as Record<string, unknown>)[key],
          })),
        }),
    };
    const db = {
      collection: () => query,
      batch: () => ({
        update: (ref: string, data: Record<string, unknown>) =>
          updates.push([ref, data]),
        set: () => undefined,
        commit: () => Promise.resolve(),
      }),
    } as unknown as Parameters<typeof rewriteOpenStudySessions>[0];
    await rewriteOpenStudySessions(db, 'uid', {
      ...base,
      termLanguage: 'es-US',
      cards: [{ id: 'a', term: 'hola', definition: 'hi', speak }],
    });
    const byId = Object.fromEntries(updates);
    expect(byId['s-es']).not.toHaveProperty('speak');
    expect((byId['s-es'].cards as FlashcardSet['cards'])[0].speak).toBe(speak);
    expect(byId['s-fr']).toHaveProperty('speak');
    expect((byId['s-fr'].cards as FlashcardSet['cards'])[0]).not.toHaveProperty(
      'speak'
    );
    expect(byId['s-none']).not.toHaveProperty('speak');
    expect(
      (byId['s-none'].cards as FlashcardSet['cards'])[0]
    ).not.toHaveProperty('speak');
  });

  it('writes a connector stamp to the snapshot', () => {
    const { db, batch, calls } = recorder();
    const stamp = { dialects: ['es-419'], attempts: 3 };
    stageSetWrite(
      db,
      batch,
      'uid',
      { ...base, termLanguage: 'es-US', publicShareId: 'share' },
      'es-US',
      stamp,
      OWNED
    );
    expect(calls.find((c) => c.op === 'update')?.data).toMatchObject({
      speak: stamp,
    });
  });

  it('creates a missing snapshot without a delete marker and refuses an unchecked one', () => {
    const { db, batch, calls } = recorder();
    const shared = { ...base, termLanguage: 'fr-FR', publicShareId: 'share' };
    stageSetWrite(db, batch, 'uid', shared, 'es-US', undefined, {
      exists: false,
    });
    const created = calls.find((c) => c.op === 'create');
    expect(created?.path).toBe('public_flashcard_sets/share');
    expect(created?.data).toMatchObject({ teacherUid: 'uid' });
    expect(created?.data).not.toHaveProperty('speak');
    expect(() => stageSetWrite(db, batch, 'uid', shared)).toThrow();
  });

  it('refuses a snapshot another teacher owns and passes an absent or own one', async () => {
    const dbFor = (data?: Record<string, unknown>) =>
      ({
        doc: () => ({
          get: () =>
            Promise.resolve({
              exists: !!data,
              get: (k: string) => data?.[k],
              updateTime: OWNED_TIME,
            }),
        }),
      }) as unknown as Parameters<typeof guardPublicShare>[0];
    await expect(guardPublicShare(dbFor(), 'me', 's')).resolves.toEqual({
      exists: false,
    });
    await expect(
      guardPublicShare(dbFor({ teacherUid: 'me' }), 'me', 's')
    ).resolves.toEqual({ exists: true, updateTime: OWNED_TIME });
    await expect(
      guardPublicShare(dbFor({ teacherUid: 'victim' }), 'me', 's')
    ).rejects.toThrow(/not yours/);
  });

  it('re-stamps open sessions with their lock and skips one turned off', async () => {
    const updates: Array<[string, Record<string, unknown>]> = [];
    const choice = {
      preset: 'beginner',
      strict: false,
      groups: { 'es-trill-stale': 'forgive' },
      attempts: 2,
      example: true,
    };
    const sessions = [
      { id: 's-locked', speak: { dialects: ['es-419'], locked: true } },
      { id: 's-new' },
      { id: 's-off', speakOff: true },
      {
        id: 's-chosen',
        speak: { dialects: ['es-419'], locked: false },
        speakChoice: choice,
      },
    ];
    const query = {
      where: () => query,
      get: () =>
        Promise.resolve({
          empty: false,
          size: sessions.length,
          docs: sessions.map((data) => ({
            id: data.id,
            ref: data.id,
            get: (key: string) => (data as Record<string, unknown>)[key],
          })),
        }),
    };
    const db = {
      collection: () => query,
      batch: () => ({
        update: (ref: string, data: Record<string, unknown>) =>
          updates.push([ref, data]),
        set: () => undefined,
        commit: () => Promise.resolve(),
      }),
    } as unknown as Parameters<typeof rewriteOpenStudySessions>[0];
    const stamp = { dialects: ['es-ES'], attempts: 5 };
    await rewriteOpenStudySessions(
      db,
      'uid',
      {
        ...base,
        termLanguage: 'es-US',
        cards: [{ id: 'a', term: 'hola', definition: 'hi', speak }],
      },
      stamp
    );
    const byId = Object.fromEntries(updates);
    expect(byId['s-locked'].speak).toEqual({ ...stamp, locked: true });
    expect(byId['s-new'].speak).toEqual({ ...stamp, locked: false });
    expect(byId['s-chosen'].speak).toMatchObject({
      ...stamp,
      preset: 'beginner',
      strict: false,
      attempts: 2,
      example: true,
      locked: false,
    });
    // A named level's groups are rebuilt for the set's language, dropping a stale id.
    expect(
      (byId['s-chosen'].speak as { groups: Record<string, string> }).groups
    ).not.toHaveProperty('es-trill-stale');
    expect((byId['s-new'].cards as FlashcardSet['cards'])[0].speak).toBe(speak);
    expect(byId['s-off']).not.toHaveProperty('speak');
    expect(
      (byId['s-off'].cards as FlashcardSet['cards'])[0]
    ).not.toHaveProperty('speak');
  });
});

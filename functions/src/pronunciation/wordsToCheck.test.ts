import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});
vi.mock('../functionsInit', () => ({}));

const state = vi.hoisted(() => ({
  admins: new Set<string>(),
  granted: true,
  sessions: [] as {
    id: string;
    data: Record<string, unknown>;
    content?: Record<string, unknown>;
    progress: { id: string; data: Record<string, unknown> }[];
  }[],
  sessionQuery: [] as unknown[],
}));

vi.mock('../quizMediaArchive', () => ({
  isGlobalFeatureGranted: () => Promise.resolve(state.granted),
}));

vi.mock('firebase-admin', () => {
  const docRef = (session: (typeof state.sessions)[number]) => ({
    collection: (name: string) =>
      name === 'content'
        ? {
            doc: () => ({
              get: () => Promise.resolve({ data: () => session.content }),
            }),
          }
        : {
            select: () => ({
              get: () =>
                Promise.resolve({
                  docs: session.progress.map((p) => ({
                    id: p.id,
                    get: (field: string) => p.data[field],
                  })),
                }),
            }),
          },
  });
  const firestore = () => ({
    collection: (name: string) => {
      if (name === 'admins') {
        return {
          doc: (email: string) => ({
            get: () => Promise.resolve({ exists: state.admins.has(email) }),
          }),
        };
      }
      return {
        where: (...args: unknown[]) => {
          state.sessionQuery = args;
          return {
            orderBy: () => ({
              limit: () => ({
                get: () =>
                  Promise.resolve({
                    size: state.sessions.length,
                    docs: state.sessions.map((s) => ({
                      id: s.id,
                      data: () => s.data,
                      ref: docRef(s),
                    })),
                  }),
              }),
            }),
          };
        },
      };
    },
  });
  return { firestore, default: { firestore } };
});

import {
  listSpeakWordsToCheckV1,
  parseSpeakCards,
  poolSpeakWordsToCheck,
  type SpeakCheckSession,
} from './wordsToCheck';

const speakCard = (id: string, term: string) => ({
  id,
  term,
  definition: `${term} meaning`,
  speak: {
    term,
    refs: [{ dialect: 'es-419', tokens: ['p', 'e'], stress: [0] }],
    g2pVersion: 'v1',
    status: 'ready',
  },
});

const STAMP = { dialects: ['es-419'], locked: false, attempts: 3 };

// One progress doc per outcome: 'miss' ends on s 0, 'pass' on s 2, 'none' never practised.
const session = (
  id: string,
  outcomes: ('miss' | 'pass' | 'none')[],
  opts: { term?: string; uidPrefix?: string; at?: number } = {}
): SpeakCheckSession => ({
  id,
  termLanguage: 'es-MX',
  definitionLanguage: 'en-US',
  speak: STAMP,
  cards: parseSpeakCards([speakCard('c1', opts.term ?? 'perro')]),
  progress: outcomes.map((outcome, i) => ({
    studentUid: `${opts.uidPrefix ?? id}-s${i}`,
    lastActiveAt: opts.at ?? 1,
    speak:
      outcome === 'none'
        ? {}
        : { c1: { s: outcome === 'miss' ? 0 : 2, c: 1, w: 1 } },
  })),
});

describe('poolSpeakWordsToCheck', () => {
  it('lists a word once 5 students attempted it and 60% missed', () => {
    const words = poolSpeakWordsToCheck([
      session('a', ['miss', 'miss', 'miss', 'pass', 'pass', 'none']),
    ]);
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({
      term: 'perro',
      language: 'es',
      students: 5,
      missed: 3,
      assignments: 1,
    });
  });

  it('leaves out words under either cut-off', () => {
    expect(
      poolSpeakWordsToCheck([session('a', ['miss', 'miss', 'miss', 'miss'])])
    ).toEqual([]);
    expect(
      poolSpeakWordsToCheck([
        session('a', ['miss', 'miss', 'pass', 'pass', 'pass']),
      ])
    ).toEqual([]);
  });

  it('pools the same word across assignments, ignoring case', () => {
    const words = poolSpeakWordsToCheck([
      session('a', ['miss', 'miss', 'pass']),
      session('b', ['miss', 'miss'], { term: 'Perro' }),
    ]);
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({ students: 5, missed: 4, assignments: 2 });
    expect(words[0].card.term).toBe('perro');
  });

  it('keeps a stored stamp playable', () => {
    const odd = {
      ...session('a', ['miss', 'miss', 'miss', 'miss', 'miss']),
      speak: { dialects: ['xx', 7], groups: 'bad', locked: true },
    };
    expect(poolSpeakWordsToCheck([odd])[0].settings).toMatchObject({
      dialects: ['es-419'],
      groups: {},
    });
  });

  it('counts a student in two assignments once, by their latest round', () => {
    const words = poolSpeakWordsToCheck([
      session('a', ['miss', 'miss', 'miss', 'miss', 'miss'], {
        uidPrefix: 'kid',
        at: 1,
      }),
      session('b', ['pass', 'pass', 'pass', 'pass', 'pass'], {
        uidPrefix: 'kid',
        at: 2,
      }),
    ]);
    expect(words).toEqual([]);
  });

  it('keeps words of different languages apart', () => {
    const german = {
      ...session('b', ['miss', 'miss', 'miss']),
      termLanguage: 'de-DE',
    };
    expect(
      poolSpeakWordsToCheck([session('a', ['miss', 'miss', 'miss']), german])
    ).toEqual([]);
  });
});

describe('parseSpeakCards', () => {
  it('skips cards Speak cannot score', () => {
    const stale = { ...speakCard('c2', 'gato'), term: 'gata' };
    const unavailable = {
      ...speakCard('c3', 'mesa'),
      speak: { ...speakCard('c3', 'mesa').speak, status: 'unavailable' },
    };
    const noTokens = {
      ...speakCard('c4', 'sol'),
      speak: {
        ...speakCard('c4', 'sol').speak,
        refs: [{ dialect: 'es-419', tokens: [], stress: [] }],
      },
    };
    const cards = parseSpeakCards([
      speakCard('c1', 'perro'),
      stale,
      unavailable,
      noTokens,
      { id: 'c5', term: 'luz', definition: 'light' },
      null,
    ]);
    expect(cards.map((c) => c.id)).toEqual(['c1']);
  });
});

type Handler = (request: unknown) => Promise<{
  words: { term: string }[];
  assignments: number;
}>;
const call = listSpeakWordsToCheckV1 as unknown as Handler;

const request = (token: Record<string, unknown>) => ({
  auth: { uid: 'u1', token: { email_verified: true, ...token } },
  data: {},
});

describe('listSpeakWordsToCheckV1', () => {
  beforeEach(() => {
    state.admins = new Set(['admin@orono.k12.mn.us']);
    state.granted = true;
    state.sessions = [];
  });

  it('turns away signed-out callers, students and teachers', async () => {
    await expect(call({ data: {} })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      call(request({ email: 'kid@orono.k12.mn.us', studentRole: true }))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      call(request({ email: 'teacher@orono.k12.mn.us' }))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      call(request({ email: 'admin@orono.k12.mn.us', email_verified: false }))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('turns away an admin while Speak is off for them', async () => {
    state.granted = false;
    await expect(
      call(request({ email: 'Admin@orono.k12.mn.us' }))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('pools stamped sessions, reading per-period cards from content', async () => {
    const progress = ['miss', 'miss', 'miss', 'miss', 'pass'].map(
      (outcome, i) => ({
        id: `s${i}`,
        data: {
          lastActiveAt: 1,
          speak: { c1: { s: outcome === 'miss' ? 0 : 3, c: 1, w: 0 } },
        },
      })
    );
    state.sessions = [
      {
        id: 'per-period',
        data: {
          termLanguage: 'es',
          speak: STAMP,
          cards: [],
          cardsInContent: true,
        },
        content: { cards: [speakCard('c1', 'perro')] },
        progress,
      },
      {
        id: 'no-cards',
        data: { termLanguage: 'es', speak: STAMP, cards: [] },
        progress,
      },
    ];
    const out = await call(request({ email: 'Admin@orono.k12.mn.us' }));
    expect(state.sessionQuery).toEqual(['speak.locked', 'in', [true, false]]);
    expect(out.assignments).toBe(1);
    expect(out.words.map((w) => w.term)).toEqual(['perro']);
  });
});

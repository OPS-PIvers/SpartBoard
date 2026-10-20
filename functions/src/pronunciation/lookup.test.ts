import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
// Voice readings need Cloud TTS and the model; voiceRefs.test.ts covers them.
vi.mock('./voiceRefs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./voiceRefs')>()),
  createVoiceReader: () => ({ read: () => Promise.resolve([]) }),
}));
vi.mock('../classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('firebase-admin', () => ({ firestore: () => ({}) }));
const isGlobalFeatureGranted =
  vi.fn<(...args: unknown[]) => Promise<boolean>>();
vi.mock('../quizMediaArchive', () => ({
  isGlobalFeatureGranted: (...args: unknown[]) =>
    isGlobalFeatureGranted(...args),
}));

import {
  computeSpeakReferences,
  lookupSpeakReferencesV1,
  MAX_LOOKUP_TERMS,
  parseLookupInput,
  SPEAK_G2P_VERSION,
  SPEAK_G2P_VOICES_PENDING,
} from './lookup';
import { loadPhonemizer } from './espeak';
import type { FlashcardCardSpeak, SpeakDialect, SpeakLanguage } from './types';

const DIALECTS: Record<SpeakLanguage, SpeakDialect[]> = {
  es: ['es-419', 'es-ES'],
  de: ['de-DE'],
  en: ['en-US'],
};

async function lookup(
  language: SpeakLanguage,
  term: string,
  ipaOverride?: Partial<Record<SpeakDialect, string>>
): Promise<FlashcardCardSpeak> {
  const out = await computeSpeakReferences({
    language,
    dialects: DIALECTS[language],
    terms: [{ cardId: 'c1', term, ...(ipaOverride ? { ipaOverride } : {}) }],
  });
  return out.cards.c1;
}

beforeAll(async () => {
  await loadPhonemizer();
});

describe('computeSpeakReferences', () => {
  it('gives each Spanish dialect its own reference with 0-based stress', async () => {
    const card = await lookup('es', 'zapato');
    expect(card.status).toBe('ready');
    expect(
      card.refs.map((r) => [r.dialect, r.tokens.join(' '), r.stress])
    ).toEqual([
      ['es-419', 's a p a t o', [1]],
      ['es-ES', 'θ a p a t o', [1]],
    ]);
    expect(card.refs[0].letterSpans).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6,
    ]);
  });

  it('accepts both -mente stresses silently (R5)', async () => {
    const card = await lookup('es', 'rápidamente');
    expect(card.status).toBe('ready');
    expect(card.refs[0].stress).toEqual([0, 3]);
  });

  it('cross-checks Spanish stress on letters only', async () => {
    const card = await lookup('es', '¡Hola!');
    expect(card.status).toBe('ready');
    expect(card.refs[0].stress).toEqual([0]);
    expect(card.refs[0].letterSpans).toEqual([2, 3, 3, 4, 4, 5]);
  });

  it('speaks the first answer variant', async () => {
    const card = await lookup('es', 'casa / hogar');
    expect(card.term).toBe('casa / hogar');
    expect(card.refs[0].tokens).toEqual(['k', 'a', 's', 'a']);
  });

  it('marks a multi-word term unavailable', async () => {
    expect(await lookup('es', 'el perro')).toMatchObject({
      refs: [],
      status: 'unavailable',
      reasons: ['multi-word'],
      dialects: ['es-419', 'es-ES'],
    });
  });

  it('writes German short ü as y, which the model knows', async () => {
    for (const [term, tokens] of [
      ['müssen', 'm y s ə n'],
      ['fünf', 'f y n f'],
      ['Glück', 'ɡ l y k'],
    ]) {
      const card = await lookup('de', term);
      expect(card.status).toBe('ready');
      expect(card.refs[0].tokens.join(' ')).toBe(tokens);
    }
  });

  it('keeps German UR unrenderable, as espeak-ng 1.51 did', async () => {
    expect(await lookup('de', 'durch')).toMatchObject({
      refs: [],
      status: 'unavailable',
      reasons: ['unrenderable'],
    });
  });

  it('flags a German item espeak reads as English', async () => {
    const card = await lookup('de', 'Baby');
    expect(card.status).toBe('needs-review');
    expect(card.reasons).toContain('language-switch');
    expect(card.refs).toHaveLength(1);
  });

  it('flags an English word whose segments CMUDict disagrees with', async () => {
    const card = await lookup('en', 'husband');
    expect(card.status).toBe('needs-review');
    expect(card.reasons).toEqual(['g2p-disagree']);
  });

  it('keeps both stresses when CMUDict disagrees, and flags it (R1)', async () => {
    const card = await lookup('en', 'record');
    expect(card.status).toBe('needs-review');
    expect(card.reasons).toEqual(['stress-disagree']);
    expect(card.refs[0].stress).toEqual([0, 1]);
  });

  it('spells initialisms by letter name', async () => {
    const card = await lookup('en', 'DNA');
    expect(card.refs[0].letterSpans).toEqual([0, 1, 0, 1, 1, 2, 1, 2, 2, 3]);
  });

  it('uses a teacher override as given, without flags', async () => {
    const card = await lookup('en', 'record', { 'en-US': 'ɹᵻkˈoːɹd' });
    expect(card.status).toBe('ready');
    expect(card.ipaOverride).toEqual({ 'en-US': 'ɹᵻkˈoːɹd' });
    expect(card.refs[0].tokens).toEqual(['ɹ', 'ᵻ', 'k', 'oːɹ', 'd']);
    expect(card.refs[0].stress).toEqual([1]);
  });

  it('marks an override the model cannot spell untokenizable', async () => {
    expect(await lookup('en', 'cat', { 'en-US': 'kæ§t' })).toMatchObject({
      refs: [],
      status: 'unavailable',
      reasons: ['untokenizable'],
    });
  });

  it('keeps the other dialect when one fails, for review', async () => {
    const card = await lookup('es', 'gato', { 'es-ES': '§' });
    expect(card.status).toBe('needs-review');
    expect(card.reasons).toEqual(['untokenizable']);
    expect(card.refs.map((r) => r.dialect)).toEqual(['es-419']);
    // Both accents were tried, so the editor won't look es-ES up again.
    expect(card.dialects).toEqual(['es-419', 'es-ES']);
  });

  it('reports lookup-failed when espeak throws', async () => {
    const out = await computeSpeakReferences(
      {
        language: 'en',
        dialects: ['en-US'],
        terms: [{ cardId: 'c1', term: 'cat' }],
      },
      {
        phonemize: () => {
          throw new Error('boom');
        },
      }
    );
    expect(out.cards.c1).toMatchObject({
      refs: [],
      status: 'unavailable',
      reasons: ['lookup-failed'],
    });
  });

  it('looks up a 500-term batch well inside the callable timeout', async () => {
    const words = ['perro', 'gato', 'ciudad', 'zapato', 'rápidamente'];
    const terms = Array.from({ length: MAX_LOOKUP_TERMS }, (_, i) => ({
      cardId: `c${i}`,
      term: `${words[i % words.length]}${i % 7 === 0 ? 's' : ''}`,
    }));
    const started = Date.now();
    const out = await computeSpeakReferences({
      language: 'es',
      dialects: ['es-419', 'es-ES'],
      terms,
    });
    expect(Object.keys(out.cards)).toHaveLength(MAX_LOOKUP_TERMS);
    expect(Date.now() - started).toBeLessThan(30_000);
  });
});

describe('parseLookupInput', () => {
  const ok = {
    language: 'es',
    dialects: ['es-419'],
    terms: [{ cardId: 'a', term: 'perro' }],
  };

  it('accepts the contract shape', () => {
    expect(parseLookupInput(ok)).toEqual(ok);
  });

  it.each([
    ['no object', null],
    ['an unsupported language', { ...ok, language: 'fr' }],
    ['a dialect outside the language', { ...ok, dialects: ['de-DE'] }],
    ['no dialects', { ...ok, dialects: [] }],
    [
      'too many terms',
      {
        ...ok,
        terms: Array.from({ length: 501 }, (_, i) => ({
          cardId: `${i}`,
          term: 'x',
        })),
      },
    ],
    [
      'duplicate card ids',
      {
        ...ok,
        terms: [
          { cardId: 'a', term: 'x' },
          { cardId: 'a', term: 'y' },
        ],
      },
    ],
    ['a non-string term', { ...ok, terms: [{ cardId: 'a', term: 3 }] }],
    [
      'an override for another language',
      {
        ...ok,
        terms: [{ cardId: 'a', term: 'x', ipaOverride: { 'en-US': 'x' } }],
      },
    ],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseLookupInput(raw)).toThrow();
  });

  it('drops blank overrides', () => {
    expect(
      parseLookupInput({
        ...ok,
        terms: [{ cardId: 'a', term: 'perro', ipaOverride: { 'es-419': ' ' } }],
      }).terms[0]
    ).toEqual({ cardId: 'a', term: 'perro' });
  });
});

type Handler = (req: { auth?: unknown; data?: unknown }) => Promise<unknown>;
const call = lookupSpeakReferencesV1 as unknown as Handler;
const teacher = {
  uid: 't1',
  token: {
    email: 'teacher@example.com',
    firebase: { sign_in_provider: 'google.com' },
  },
};
const data = {
  language: 'en',
  dialects: ['en-US'],
  terms: [{ cardId: 'a', term: 'cat' }],
};

describe('lookupSpeakReferencesV1', () => {
  beforeEach(() => {
    isGlobalFeatureGranted.mockReset();
    isGlobalFeatureGranted.mockResolvedValue(true);
  });

  it('requires sign-in', async () => {
    await expect(call({ data })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects anonymous students', async () => {
    await expect(
      call({
        auth: {
          uid: 's1',
          token: { firebase: { sign_in_provider: 'anonymous' } },
        },
        data,
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(isGlobalFeatureGranted).not.toHaveBeenCalled();
  });

  it('rejects student-role tokens', async () => {
    await expect(
      call({
        auth: {
          uid: 's1',
          token: {
            studentRole: true,
            firebase: { sign_in_provider: 'custom' },
          },
        },
        data,
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a teacher without the flag', async () => {
    isGlobalFeatureGranted.mockResolvedValue(false);
    await expect(call({ auth: teacher, data })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(isGlobalFeatureGranted).toHaveBeenCalledWith(
      {},
      'flashcards-speak',
      'teacher@example.com',
      't1'
    );
  });

  it('returns references for a teacher with the flag', async () => {
    const out = (await call({ auth: teacher, data })) as {
      cards: Record<string, FlashcardCardSpeak>;
    };
    expect(out.cards.a.refs[0].tokens).toEqual(['k', 'æ', 't']);
    expect(out.cards.a.g2pVersion).toBe(SPEAK_G2P_VERSION);
  });

  it('leaves voices pending when the editor asks for the quick check', async () => {
    const out = (await call({
      auth: teacher,
      data: { ...data, voices: false },
    })) as { cards: Record<string, FlashcardCardSpeak> };
    expect(out.cards.a.refs[0].tokens).toEqual(['k', 'æ', 't']);
    expect(out.cards.a.g2pVersion).toBe(SPEAK_G2P_VOICES_PENDING);
  });
});

describe('review fixes', () => {
  it('hears a decomposed accent like a composed one, spans on the original text', async () => {
    const nfd = 'está'.normalize('NFD');
    const card = await lookup('es', nfd);
    expect(card.status).toBe('ready');
    expect(card.refs[0].stress).toEqual([1]);
    expect(card.refs[0].letterSpans?.at(-1)).toBe(nfd.length);
  });

  it('treats a term espeak reads as several words as multi-word', async () => {
    expect(await lookup('en', '42')).toMatchObject({
      status: 'unavailable',
      reasons: ['multi-word'],
    });
  });

  it('refuses a word longer than any real one', async () => {
    expect(await lookup('es', 'a'.repeat(65))).toMatchObject({
      status: 'unavailable',
      reasons: ['untokenizable'],
    });
  });

  it('accepts dictionary-style override notation', async () => {
    const card = await lookup('de', 'Schütze', { 'de-DE': '/ˈʃʏ.tsə/' });
    expect(card.status).toBe('ready');
    expect(card.refs[0].tokens).toContain('y');
  });

  it('keeps a __proto__ card id as an ordinary key', async () => {
    const out = await computeSpeakReferences({
      language: 'en',
      dialects: ['en-US'],
      terms: [{ cardId: '__proto__', term: 'cat' }],
    });
    expect(Object.keys(out.cards)).toEqual(['__proto__']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  fitSpeakToDoc,
  firestoreBytes,
  SPEAK_DOC_BUDGET_BYTES,
} from './fitSpeakToDoc';
import { MAX_VOICE_TOKENS } from './voiceRefs';
import { VOCAB_TOKENS } from './vocab';
import { PRONUNCIATION_VOICES } from './voices';
import { MAX_CARDS } from '../mcp/flashcardStore';
import type { FlashcardCardSpeak, FlashcardSpeakReference } from './types';

const PATH = 'users/teacher-uid-0123456789/flashcard_sets/set-id-0123456789';
const docBytes = (set: unknown) =>
  new TextEncoder().encode(PATH).length + 1 + 32 + firestoreBytes(set);

// The longest tokens the model can emit, so every reference is as big as it can be.
const LONGEST = [...VOCAB_TOKENS]
  .filter((t) => !t.startsWith('<') && t !== '??')
  .sort(
    (a, b) =>
      new TextEncoder().encode(b).length - new TextEncoder().encode(a).length
  )
  .slice(0, 8);
const tokens = (seed: number) =>
  Array.from({ length: MAX_VOICE_TOKENS }, (_, i) => LONGEST[(i + seed) % 8]);
const stress = Array.from({ length: 32 }, (_, i) => i);

const espeak = (dialect: 'es-419' | 'es-ES'): FlashcardSpeakReference => ({
  dialect,
  tokens: tokens(0),
  stress,
  letterSpans: Array.from({ length: MAX_VOICE_TOKENS * 2 }, (_, i) => i),
});
const voice = (dialect: 'es-419' | 'es-ES', seed: number) => ({
  dialect,
  tokens: tokens(seed),
  stress,
  source: 'voice' as const,
});

const worstSpeak = (term: string): FlashcardCardSpeak => ({
  term,
  refs: [
    espeak('es-419'),
    espeak('es-ES'),
    // Every Spanish voice read the word its own way.
    ...PRONUNCIATION_VOICES.es.map((_, i) =>
      voice(i < 4 ? 'es-ES' : 'es-419', i + 1)
    ),
  ],
  g2pVersion: 'v',
  status: 'needs-review',
  reasons: ['stress-disagree'],
  dialects: ['es-419', 'es-ES'],
  confirmedAt: 1,
});

const set = (termLength: number, definitionLength: number) => ({
  id: 'set-id-0123456789',
  title: 'Vocabulario',
  termLanguage: 'es-US',
  cards: Array.from({ length: MAX_CARDS }, (_, i) => {
    const term = `${i}`.padEnd(termLength, 'ñ');
    return {
      id: `card-${i}`,
      term,
      definition: 'd'.repeat(definitionLength),
      speak: worstSpeak(term),
    };
  }),
  updatedAt: 1,
});

describe('fitSpeakToDoc', () => {
  it('returns the set itself when it already fits', () => {
    const small = { cards: [{ id: 'a', speak: worstSpeak('hola') }] };
    expect(fitSpeakToDoc(PATH, small)).toBe(small);
  });

  it('brings the largest Speak set under the budget', () => {
    const big = set(64, 40);
    // Several times Firestore's 1 MiB cap before shedding.
    expect(docBytes(big)).toBeGreaterThan(4 * 1024 * 1024);
    const fitted = fitSpeakToDoc(PATH, big);
    expect(docBytes(fitted)).toBeLessThanOrEqual(SPEAK_DOC_BUDGET_BYTES);
    // The caller's set is not changed.
    expect(big.cards[0].speak.refs).toHaveLength(10);
  });

  it('sheds voice readings from the last cards first, keeping espeak refs', () => {
    const big = set(8, 10);
    const voiceBytes = firestoreBytes(
      big.cards[0].speak.refs.filter((r) => r.source === 'voice')
    );
    // Room for all but about 100 cards' voice readings.
    const fitted = fitSpeakToDoc(PATH, big, docBytes(big) - 100 * voiceBytes);
    const voices = fitted.cards.map(
      (c) => c.speak.refs.filter((r) => r.source === 'voice').length
    );
    expect(voices[0]).toBe(8);
    expect(voices[voices.length - 1]).toBe(0);
    expect(voices).toEqual([...voices].sort((a, b) => b - a));
    for (const card of fitted.cards) {
      expect(card.speak.refs.filter((r) => r.source !== 'voice')).toEqual([
        espeak('es-419'),
        espeak('es-ES'),
      ]);
    }
  });

  it('stubs a card only once every voice and letter highlight is gone', () => {
    const fitted = fitSpeakToDoc(PATH, set(200, 300));
    expect(docBytes(fitted)).toBeLessThanOrEqual(SPEAK_DOC_BUDGET_BYTES);
    const last = fitted.cards[fitted.cards.length - 1].speak;
    expect(last).toEqual({
      term: last.term,
      refs: [],
      g2pVersion: 'v',
      status: 'unavailable',
      dialects: ['es-419', 'es-ES'],
    });
    for (const card of fitted.cards) {
      expect(card.speak.refs.every((r) => r.source !== 'voice')).toBe(true);
      expect(card.speak.refs.every((r) => !('letterSpans' in r))).toBe(true);
    }
    expect(fitted.cards[0].speak.refs).toHaveLength(2);
  });

  it('fits whenever the cards fit without Speak', () => {
    for (const [term, definition] of [
      [64, 0],
      [200, 500],
      [500, 1000],
      [64, 1300],
    ]) {
      const big = set(term, definition);
      const bare = {
        ...big,
        cards: big.cards.map(({ id, term, definition }) => ({
          id,
          term,
          definition,
        })),
      };
      // The stub keeps its term, so leave room for that.
      if (docBytes(bare) * 2 > SPEAK_DOC_BUDGET_BYTES) continue;
      expect(docBytes(fitSpeakToDoc(PATH, big))).toBeLessThanOrEqual(
        SPEAK_DOC_BUDGET_BYTES
      );
    }
  });

  it('gives a card saved before lookups recorded accents its language’s accents', () => {
    const legacy: Partial<FlashcardCardSpeak> = worstSpeak('perro');
    delete legacy.dialects;
    const fitted = fitSpeakToDoc(
      PATH,
      { cards: [{ id: 'a', speak: legacy }] },
      0
    );
    expect(fitted.cards[0]).toMatchObject({
      speak: { dialects: ['es-419', 'es-ES'] },
    });
  });

  it('leaves cards without Speak and unknown shapes alone', () => {
    const odd = {
      cards: [
        { id: 'a', term: 'x'.repeat(2000), definition: '' },
        { id: 'b', speak: 'nope' },
        null,
      ],
    };
    expect(fitSpeakToDoc(PATH, odd, 10).cards).toEqual(odd.cards);
  });
});

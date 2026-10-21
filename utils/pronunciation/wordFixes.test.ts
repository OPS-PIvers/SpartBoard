import { describe, it, expect } from 'vitest';
import type { FlashcardCard } from '@/types';
import {
  applySpeakWordFixes,
  heardReferences,
  normalizeSpeakWordFixes,
  speakWordKey,
} from './wordFixes';

const card = (
  id: string,
  term: string,
  dialect: 'es-419' | 'es-ES' = 'es-419',
  speakTerm = term
): FlashcardCard => ({
  id,
  term,
  definition: 'x',
  speak: {
    term: speakTerm,
    refs: [{ dialect, tokens: ['p', 'e', 'r', 'o'], stress: [0] }],
    g2pVersion: 'v1',
    status: 'ready',
  },
});

const REF = { dialect: 'es-419', tokens: ['p', 'e', 'ɾ', 'o'], stress: [] };

describe('normalizeSpeakWordFixes', () => {
  it('keeps well-formed fixes and drops anything off-shape', () => {
    const fixes = normalizeSpeakWordFixes({
      words: {
        'es:perro': {
          language: 'es',
          term: 'Perro',
          skip: false,
          accepted: [
            { id: 'a', kind: 'spelling', spelling: 'pero', refs: [REF] },
            { id: 'b', kind: 'spelling', refs: [{ ...REF, dialect: 'de-DE' }] },
            { id: 'c', kind: 'other', refs: [REF] },
          ],
        },
        'es:gato': { language: 'es', term: 'gato', skip: false, accepted: [] },
        'es:wrong-key': { language: 'es', term: 'mesa', skip: true },
        'xx:sol': { language: 'xx', term: 'sol', skip: true },
      },
    });
    expect(Object.keys(fixes)).toEqual(['es:perro']);
    expect(fixes['es:perro'].accepted).toHaveLength(1);
    expect(fixes['es:perro'].accepted[0].refs[0].source).toBe('voice');
  });

  it('reads a missing doc as no fixes', () => {
    expect(normalizeSpeakWordFixes(undefined)).toEqual({});
  });
});

describe('applySpeakWordFixes', () => {
  const fixes = normalizeSpeakWordFixes({
    words: {
      'es:perro': {
        language: 'es',
        term: 'perro',
        skip: false,
        accepted: [{ id: 'a', kind: 'recording', refs: [REF] }],
      },
      'es:casa': { language: 'es', term: 'casa', skip: true },
    },
  });

  it('adds accepted readings and marks skipped words unavailable', () => {
    const cards = [card('1', 'Perro'), card('2', 'casa'), card('3', 'luz')];
    const out = applySpeakWordFixes(cards, 'es', fixes);
    expect(out[0].speak?.refs).toHaveLength(2);
    // Same syllable count as the card's reading, so its stress carries over.
    expect(out[0].speak?.refs[1].stress).toEqual([0]);
    expect(out[1].speak?.status).toBe('unavailable');
    expect(out[2]).toBe(cards[2]);
  });

  it('adds nothing for an accent the card has no reading for', () => {
    const spain = card('1', 'perro', 'es-ES');
    expect(applySpeakWordFixes([spain], 'es', fixes)[0]).toBe(spain);
  });

  it('returns the same array when nothing applies', () => {
    const cards = [card('3', 'luz')];
    expect(applySpeakWordFixes(cards, 'es', fixes)).toBe(cards);
    expect(applySpeakWordFixes(cards, 'es', {})).toBe(cards);
  });

  it('leaves a card whose readings are for an older term alone', () => {
    const stale = card('1', 'perro', 'es-419', 'perros');
    expect(applySpeakWordFixes([stale], 'es', fixes)[0]).toBe(stale);
  });
});

describe('heardReferences', () => {
  const vocab = {
    '<pad>': 0,
    '<unk>': 3,
    '??': 85,
    '|': 1,
    p: 2,
    e: 3,
    ɾ: 4,
    o: 5,
  };
  it('reads the sounds for every accent of the language', () => {
    const refs = heardReferences(['p', '|', 'e', 'ɾ', 'o'], 'es', vocab);
    expect(refs?.map((r) => r.dialect)).toEqual(['es-419', 'es-ES']);
    expect(refs?.[0]).toEqual({
      dialect: 'es-419',
      tokens: ['p', 'e', 'ɾ', 'o'],
      stress: [],
      source: 'voice',
    });
  });

  it('refuses a take with any unusable sound rather than shortening it', () => {
    expect(heardReferences(['p', '<unk>', 'o'], 'es', vocab)).toBeNull();
    expect(heardReferences(['p', '??'], 'es', vocab)).toBeNull();
    expect(heardReferences(['p', 'zz'], 'es', vocab)).toBeNull();
    expect(heardReferences([], 'es', vocab)).toBeNull();
  });
});

describe('speakWordKey', () => {
  it('folds case and spacing', () => {
    expect(speakWordKey('de', ' Brötchen ')).toBe('de:brötchen');
  });
});

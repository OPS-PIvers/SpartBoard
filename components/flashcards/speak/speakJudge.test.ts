import { describe, expect, it } from 'vitest';
import type { FlashcardCard, FlashcardSpeakReference } from '@/types';
import type { SpeakJudgement } from '@/utils/pronunciation/verdict';
import {
  cardRefs,
  judgeTake,
  letterSegments,
  speakMarks,
  spokenWord,
  stressSyllables,
} from './speakJudge';
import { toResult } from './fakeRecognizer';

const perroRef: FlashcardSpeakReference = {
  dialect: 'es-419',
  tokens: ['p', 'e', 'r', 'o'],
  stress: [0],
  letterSpans: [0, 1, 1, 2, 2, 4, 4, 5],
};

const card = (over: Partial<FlashcardCard['speak']> = {}): FlashcardCard => ({
  id: 'perro',
  term: 'perro',
  definition: 'dog',
  speak: {
    term: 'perro',
    refs: [perroRef, { ...perroRef, dialect: 'es-ES' }],
    g2pVersion: 'test',
    status: 'ready',
    ...over,
  },
});

const judge = (spoken: string[], strict = false): SpeakJudgement =>
  judgeTake({
    card: card(),
    result: toResult({ tokens: spoken }),
    language: 'es',
    settings: { strict, groups: {}, dialects: ['es-419'] },
  });

describe('speakJudge', () => {
  it('reads the first variant of the term', () => {
    expect(
      spokenWord({ id: 'a', term: 'perro / can', definition: 'dog' })
    ).toBe('perro');
  });

  it('keeps refs for the stamped dialects, or all when none match', () => {
    expect(cardRefs(card(), ['es-ES']).map((r) => r.dialect)).toEqual([
      'es-ES',
    ]);
    expect(cardRefs(card(), ['de-DE'])).toHaveLength(2);
  });

  it('drops a disputed stress reading until the teacher confirms it', () => {
    const disputed = card({
      status: 'needs-review',
      reasons: ['stress-disagree'],
    });
    expect(cardRefs(disputed, ['es-419'])[0].stress).toEqual([]);
    const confirmed = card({
      status: 'needs-review',
      reasons: ['stress-disagree'],
      confirmedAt: 1,
    });
    expect(cardRefs(confirmed, ['es-419'])[0].stress).toEqual([0]);
  });

  it('judges with the stamp settings', () => {
    expect(judge(['p', 'e', 'r', 'o']).verdict).toBe('exact');
    expect(judge(['p', 'e', 'ɾ', 'o']).verdict).toBe('accepted');
    expect(judge(['p', 'e', 'ɾ', 'o'], true).verdict).toBe('wrong');
    expect(judge([]).verdict).toBe('unclear');
  });

  it('emphasises at most two marks, errors and consonants first', () => {
    const marks = speakMarks(judge(['b', 'a', 'ɾ', 'u']), 'es');
    expect(marks).toHaveLength(4);
    const emphasised = marks.filter((mark) => mark.emphasised);
    expect(emphasised).toHaveLength(2);
    expect(emphasised.every((mark) => !mark.forgiven)).toBe(true);
    expect(emphasised.map((mark) => mark.token)).toEqual(['p', 'e']);
  });

  it('emphasises forgiven sounds when nothing was wrong', () => {
    const marks = speakMarks(judge(['p', 'e', 'ɾ', 'o']), 'es');
    expect(marks).toEqual([
      expect.objectContaining({
        kind: 'changed',
        token: 'r',
        forgiven: true,
        groupId: 'es-trill',
        emphasised: true,
      }),
    ]);
  });

  it('marks letters by span, and places an extra sound after its letters', () => {
    const judgement = judge(['p', 'e', 'r', 'o', 's']);
    const marks = speakMarks(judgement, 'es');
    const segments = letterSegments('perro', perroRef, marks);
    expect(segments?.map((s) => s.text)).toEqual(['p', 'e', 'rr', 'o']);
    expect(segments?.[3].extras.map((m) => m.token)).toEqual(['s']);
  });

  it('marks a missed sound on its letters', () => {
    const marks = speakMarks(judge(['p', 'e', 'o']), 'es');
    const segments = letterSegments('perro', perroRef, marks);
    expect(segments?.[2]).toMatchObject({
      text: 'rr',
      marks: [expect.objectContaining({ kind: 'missed', token: 'r' })],
    });
  });

  it('falls back to chips without usable spans', () => {
    const marks = speakMarks(judge(['p', 'a', 'r', 'o']), 'es');
    expect(
      letterSegments('perro', { ...perroRef, letterSpans: undefined }, marks)
    ).toBeNull();
    expect(
      letterSegments('perro', { ...perroRef, letterSpans: [0, 1] }, marks)
    ).toBeNull();
    expect(letterSegments('per', { ...perroRef }, marks)).toBeNull();
  });

  it('splits syllables for the stress line', () => {
    expect(stressSyllables('perro', perroRef)).toEqual([
      { text: 'pe', stressed: true },
      { text: 'rro', stressed: false },
    ]);
    const casa: FlashcardSpeakReference = {
      dialect: 'es-419',
      tokens: ['k', 'a', 's', 'a'],
      stress: [1],
      letterSpans: [0, 1, 1, 2, 2, 3, 3, 4],
    };
    expect(stressSyllables('casa', casa)).toEqual([
      { text: 'ca', stressed: false },
      { text: 'sa', stressed: true },
    ]);
    expect(stressSyllables('casa', { ...casa, stress: [] })).toBeNull();
  });
});

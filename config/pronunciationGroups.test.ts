import { describe, expect, it } from 'vitest';
import vocab from '@/utils/pronunciation/xlsr53EspeakVocab.json';
import {
  PRONUNCIATION_GROUPS,
  RECOGNIZER_TOLERANCE,
  SPEAK_DIALECTS,
  SPEAK_LANGUAGES,
  SPEAK_PRESET_IDS,
  STRESS_GROUP_ID,
  presetForgiveIds,
  speakGroupIds,
  speakLanguageOf,
  speakPresetSettings,
} from './pronunciationGroups';

const tokens = new Set(Object.keys(vocab));
const allGroupIds = new Set(SPEAK_LANGUAGES.flatMap(speakGroupIds));

describe('pronunciation groups', () => {
  it.each(SPEAK_LANGUAGES)(
    '%s: every pair token is in the vocabulary',
    (language) => {
      const pairs = [
        ...PRONUNCIATION_GROUPS[language].flatMap((g) => g.pairs),
        ...RECOGNIZER_TOLERANCE[language],
      ];
      const missing = pairs
        .flatMap((p) => [p.target, p.spoken])
        .filter((t) => !tokens.has(t));
      expect(missing).toEqual([]);
    }
  );

  it('keeps tokens the vocabulary lacks out of the tables', () => {
    for (const t of ['ʏ', 'ər', 'ɪə', 'g']) expect(tokens.has(t)).toBe(false);
  });

  it.each(SPEAK_LANGUAGES)(
    '%s: no pair is listed twice or is also tolerated',
    (language) => {
      const keys = [
        ...PRONUNCIATION_GROUPS[language].flatMap((g) => g.pairs),
        ...RECOGNIZER_TOLERANCE[language],
      ].map((p) => `${p.target}>${p.spoken}${p.final ? '$' : ''}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  );

  it.each(SPEAK_LANGUAGES)(
    '%s: group ids are unique, prefixed, and end with stress',
    (language) => {
      const ids = speakGroupIds(language);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.at(-1)).toBe(STRESS_GROUP_ID);
      for (const id of ids.slice(0, -1))
        expect(id.startsWith(`${language}-`)).toBe(true);
      for (const g of PRONUNCIATION_GROUPS[language]) {
        expect(g.pairs.length > 0).toBe(g.id !== STRESS_GROUP_ID);
      }
    }
  );

  it('tolerates the Spanish tap read as a trill and yeísmo both ways', () => {
    const es = RECOGNIZER_TOLERANCE.es.map((p) => `${p.target}>${p.spoken}`);
    expect(es).toEqual(
      expect.arrayContaining(['ɾ>r', 'ʝ>j', 'j>ʝ', 'j>ʎ', 'ʎ>j', 'ʝ>ʎ', 'ʎ>ʝ'])
    );
    expect(es).toHaveLength(7);
    expect(RECOGNIZER_TOLERANCE.de).toEqual([]);
    expect(RECOGNIZER_TOLERANCE.en).toEqual([]);
  });

  it('marks only the final-position groups as final', () => {
    for (const language of SPEAK_LANGUAGES) {
      for (const g of PRONUNCIATION_GROUPS[language]) {
        const finals = g.pairs.filter((p) => p.final).length;
        const expected = ['de-final', 'en-final-voicing'].includes(g.id)
          ? g.pairs.length
          : 0;
        expect(finals).toBe(expected);
      }
    }
  });

  it('offers each language its own dialects', () => {
    for (const language of SPEAK_LANGUAGES) {
      for (const d of SPEAK_DIALECTS[language])
        expect(d.startsWith(language)).toBe(true);
    }
  });
});

describe('presets', () => {
  it('name only real groups', () => {
    for (const preset of ['beginner', 'intermediate'] as const) {
      for (const id of presetForgiveIds(preset))
        expect(allGroupIds.has(id)).toBe(true);
    }
  });

  it.each(SPEAK_LANGUAGES)(
    '%s: write an explicit setting for every group',
    (language) => {
      for (const preset of SPEAK_PRESET_IDS) {
        const { groups } = speakPresetSettings(language, preset);
        expect(Object.keys(groups).sort()).toEqual(
          speakGroupIds(language).sort()
        );
      }
    }
  );

  it('Beginner forgives the trill and requires the vowels', () => {
    const es = speakPresetSettings('es', 'beginner');
    expect(es.strict).toBe(false);
    expect(es.groups['es-trill']).toBe('forgive');
    expect(es.groups['es-vowel-glide']).toBe('require');
    expect(es.groups['es-vowel-reduce']).toBe('require');
    expect(speakPresetSettings('de', 'beginner').groups['de-umlaut']).toBe(
      'require'
    );
    expect(
      speakPresetSettings('en', 'beginner').groups['en-vowel-length']
    ).toBe('require');
  });

  it('Intermediate requires the trill and forgives stress', () => {
    const es = speakPresetSettings('es', 'intermediate');
    expect(es.strict).toBe(false);
    expect(es.groups['es-trill']).toBe('require');
    expect(es.groups[STRESS_GROUP_ID]).toBe('forgive');
  });

  it('Advanced turns Strict on and follows it for every group', () => {
    const de = speakPresetSettings('de', 'advanced');
    expect(de.strict).toBe(true);
    expect(new Set(Object.values(de.groups))).toEqual(new Set(['follow']));
  });
});

describe('speakLanguageOf', () => {
  it.each([
    ['es', 'es'],
    ['es-US', 'es'],
    ['es-MX', 'es'],
    ['ES-us', 'es'],
    ['de', 'de'],
    ['en_GB', 'en'],
    [' en-US ', 'en'],
    ['fr', null],
    ['', null],
    [undefined, null],
  ])('%s → %s', (input, expected) => {
    expect(speakLanguageOf(input)).toBe(expected);
  });
});

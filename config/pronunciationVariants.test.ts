import { describe, expect, it } from 'vitest';
import vocab from '@/utils/pronunciation/xlsr53EspeakVocab.json';
import { HIGH_LOAD_SWAPS } from '@/scripts/pronunciation-corpus/mutate';
import {
  PRONUNCIATION_GROUPS,
  RECOGNIZER_TOLERANCE,
  SPEAK_LANGUAGES,
} from './pronunciationGroups';
import { PRONUNCIATION_VARIANTS } from './pronunciationVariants';

const tokens = new Set(Object.keys(vocab));
const key = (target: string, spoken: string | null) =>
  `${target}>${spoken ?? '∅'}`;

describe('native-variant table', () => {
  it.each(SPEAK_LANGUAGES)('%s: has learned variants', (language) => {
    expect(PRONUNCIATION_VARIANTS[language].length).toBeGreaterThan(0);
  });

  it.each(SPEAK_LANGUAGES)('%s: holds no group pair', (language) => {
    const pairs = new Set(
      PRONUNCIATION_GROUPS[language].flatMap((g) =>
        g.pairs.map((p) => key(p.target, p.spoken))
      )
    );
    const found = PRONUNCIATION_VARIANTS[language]
      .map((v) => key(v.target, v.spoken))
      .filter((k) => pairs.has(k));
    expect(found).toEqual([]);
  });

  it.each(SPEAK_LANGUAGES)('%s: holds no tolerance pair', (language) => {
    const pairs = new Set(
      RECOGNIZER_TOLERANCE[language].map((p) => key(p.target, p.spoken))
    );
    const found = PRONUNCIATION_VARIANTS[language]
      .map((v) => key(v.target, v.spoken))
      .filter((k) => pairs.has(k));
    expect(found).toEqual([]);
  });

  it.each(SPEAK_LANGUAGES)('%s: holds no high-load swap', (language) => {
    const swaps = new Set(
      HIGH_LOAD_SWAPS.flatMap(([a, b]) => [key(a, b), key(b, a)])
    );
    const found = PRONUNCIATION_VARIANTS[language]
      .map((v) => key(v.target, v.spoken))
      .filter((k) => swaps.has(k));
    expect(found).toEqual([]);
  });

  it.each(SPEAK_LANGUAGES)(
    '%s: every token is a model token without tone digits or dots',
    (language) => {
      const bad = PRONUNCIATION_VARIANTS[language]
        .flatMap((v) => (v.spoken === null ? [v.target] : [v.target, v.spoken]))
        .filter((t) => !tokens.has(t) || /[\d.]/.test(t));
      expect(bad).toEqual([]);
    }
  );

  it.each(SPEAK_LANGUAGES)(
    '%s: no entry is repeated or maps a sound to itself',
    (language) => {
      const keys = PRONUNCIATION_VARIANTS[language].map((v) =>
        key(v.target, v.spoken)
      );
      expect(new Set(keys).size).toBe(keys.length);
      expect(
        PRONUNCIATION_VARIANTS[language].filter((v) => v.target === v.spoken)
      ).toEqual([]);
    }
  );
});

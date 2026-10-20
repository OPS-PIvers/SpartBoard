import { describe, expect, it } from 'vitest';
import vocab from '@/utils/pronunciation/xlsr53EspeakVocab.json';
import { PRONUNCIATION_MODEL } from '@/config/pronunciationModel';
import { PRONUNCIATION_VOICES } from '@/config/pronunciationVoices';
import mainWords from './words.json';
import heldOutWords from './words.heldout.json';
import voiceRefs from '../../tests/fixtures/pronunciation-corpus/voice-refs.json';

interface CorpusWords {
  languages: Record<
    string,
    { words: { word: string; refs?: Record<string, { tokens?: string[] }> }[] }
  >;
}
interface VoiceRef {
  dialect: string;
  tokens: string[];
  stress: number[];
  source: string;
}
const refs = voiceRefs.refs as Record<string, Record<string, VoiceRef[]>>;
const sets: [string, CorpusWords][] = [
  ['main', mainWords],
  ['heldout', heldOutWords],
];
const VOCAB: Record<string, number> = vocab;

describe('Speak corpus fixtures', () => {
  it('keeps the held-out words out of the tuning set', () => {
    for (const [language, spec] of Object.entries(heldOutWords.languages)) {
      const tuning = new Set(
        (mainWords as CorpusWords).languages[language].words.map((w) =>
          w.word.toLowerCase()
        )
      );
      expect(
        spec.words.filter((w) => tuning.has(w.word.toLowerCase()))
      ).toEqual([]);
    }
  });

  it('has voice references for every corpus word from the pinned model and voices', () => {
    expect(voiceRefs.model).toBe(PRONUNCIATION_MODEL.md5Prefix);
    expect(voiceRefs.voices).toEqual(PRONUNCIATION_VOICES);
    for (const [, words] of sets) {
      for (const [language, spec] of Object.entries(words.languages)) {
        for (const entry of spec.words) {
          expect(
            refs[language]?.[entry.word],
            `${language} ${entry.word}`
          ).toBeDefined();
        }
      }
    }
  });

  it('stores only usable, distinct voice readings beside an espeak dialect', () => {
    for (const [, words] of sets) {
      for (const [language, spec] of Object.entries(words.languages)) {
        for (const entry of spec.words) {
          const espeak = Object.entries(entry.refs ?? {}).filter(
            ([, r]) => r.tokens
          );
          const seen = new Set(espeak.map(([, r]) => r.tokens!.join(' ')));
          for (const ref of refs[language]?.[entry.word] ?? []) {
            expect(ref.source).toBe('voice');
            expect(espeak.map(([d]) => d)).toContain(ref.dialect);
            expect(ref.tokens.length).toBeGreaterThan(0);
            expect(ref.tokens.every((t) => VOCAB[t] !== undefined)).toBe(true);
            expect(seen.has(ref.tokens.join(' '))).toBe(false);
            seen.add(ref.tokens.join(' '));
          }
        }
      }
    }
  });
});

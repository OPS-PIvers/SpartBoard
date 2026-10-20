import { describe, expect, it } from 'vitest';
import vocab from '@/utils/pronunciation/xlsr53EspeakVocab.json';
import { PRONUNCIATION_MODEL } from '@/config/pronunciationModel';
import { PRONUNCIATION_VOICES } from '@/config/pronunciationVoices';
import mainWords from './words.json';
import heldOutWords from './words.heldout.json';
import nucleiData from '@/utils/pronunciation/xlsr53Nuclei.json';
import voiceRefs from '../../tests/fixtures/pronunciation-corpus/voice-refs.json';
import { espeakKey } from './lib.mjs';

interface CorpusWords {
  languages: Record<
    string,
    {
      words: {
        word: string;
        refs?: Record<string, { tokens?: string[]; stress?: number[] }>;
      }[];
    }
  >;
}
interface VoiceRef {
  dialect: string;
  tokens: string[];
  stress: number[];
  source: string;
}
const refs = voiceRefs.refs as Record<string, Record<string, VoiceRef[]>>;
const espeakKeys = voiceRefs.espeak as Record<string, Record<string, string>>;
const readings = voiceRefs.readings as Record<
  string,
  Record<string, Record<string, string[]>>
>;
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

  it('matches what the lookup would store for the committed readings', () => {
    const special = new Set(['<pad>', '<s>', '</s>', '<unk>', '??']);
    const nuclei = new Set<string>(nucleiData.nuclei);
    const nucleusCount = (t: readonly string[]) =>
      t.filter((x) => nuclei.has(x)).length;
    const dialectOf: Record<string, string> = {
      'es-ES': 'es-ES',
      'es-US': 'es-419',
      'de-DE': 'de-DE',
      'en-US': 'en-US',
    };
    for (const [, words] of sets) {
      for (const [language, spec] of Object.entries(words.languages)) {
        for (const entry of spec.words) {
          const label = `${language} ${entry.word}`;
          expect(espeakKeys[language]?.[entry.word], label).toBe(
            espeakKey(entry)
          );
          const bases = Object.entries(entry.refs ?? {})
            .filter(([, r]) => r.tokens)
            .map(([dialect, r]) => ({
              dialect,
              tokens: r.tokens!,
              stress: r.stress!,
            }));
          const seen = new Set(bases.map((b) => b.tokens.join(' ')));
          const expected: VoiceRef[] = [];
          for (const voice of PRONUNCIATION_VOICES[
            language as keyof typeof PRONUNCIATION_VOICES
          ]) {
            const base = bases.find(
              (b) =>
                b.dialect === dialectOf[voice.split('-').slice(0, 2).join('-')]
            );
            if (!base) continue;
            const tokens = readings[language]?.[entry.word]?.[voice];
            expect(tokens, `${label} ${voice}`).toBeDefined();
            if (
              !tokens?.length ||
              tokens.length > 64 ||
              !tokens.every((t) => VOCAB[t] !== undefined && !special.has(t)) ||
              seen.has(tokens.join(' '))
            )
              continue;
            seen.add(tokens.join(' '));
            expected.push({
              dialect: base.dialect,
              tokens,
              stress:
                nucleusCount(tokens) === nucleusCount(base.tokens)
                  ? base.stress
                  : [],
              source: 'voice',
            });
          }
          expect(refs[language]?.[entry.word], label).toEqual(expected);
        }
      }
    }
  });
});

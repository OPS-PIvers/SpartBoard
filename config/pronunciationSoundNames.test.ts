import { describe, expect, it } from 'vitest';
import type { SpeakLanguage } from '@/types';
import nucleiFile from '@/utils/pronunciation/xlsr53Nuclei.json';
import vocab from '@/utils/pronunciation/xlsr53EspeakVocab.json';
import {
  PRONUNCIATION_GROUPS,
  RECOGNIZER_TOLERANCE,
  SPEAK_LANGUAGES,
} from './pronunciationGroups';
import {
  SOUND_NAME_LOCALES,
  SPEAK_HEARD_ONLY_SOUNDS,
  SPEAK_SOUND_EXAMPLES,
  isKnownSpeakSound,
  soundNameLocale,
  speakSoundName,
} from './pronunciationSoundNames';

// Tokens in espeak-ng 1.51 `--ipa=3` references for the top 15,000 wordfreq words (es-419 + es, de, en-us), via tokenizeIpa, seen at least twice.
const MEASURED_REFERENCE_TOKENS: Record<SpeakLanguage, readonly string[]> = {
  es: [
    'a',
    'e',
    's',
    'o',
    'ɾ',
    'n',
    'i',
    't',
    'k',
    'l',
    'm',
    'p',
    'ð',
    'j',
    'θ',
    'u',
    'd',
    'β',
    'b',
    'r',
    'f',
    'x',
    'ɛ',
    'ɣ',
    'w',
    'ja',
    'ɡ',
    'ʎ',
    'ʝ',
    'tʃ',
    'ɲ',
    'ŋ',
    'aʊ',
    'aɪ',
    'pː',
    'eɪ',
    'eʊ',
    'oɪ',
    'ee',
    'ʃ',
    'ts',
    'oe',
    'ie',
    'ju',
    'ai',
    'uo',
    'əl',
    'au',
  ],
  de: [
    'n',
    'ə',
    't',
    'l',
    'ɾ',
    'ɛ',
    'a',
    'ɪ',
    'k',
    'f',
    's',
    'ɡ',
    'm',
    'b',
    'iː',
    'r',
    'd',
    'ʃ',
    'eː',
    'oː',
    'ɑː',
    'ɜ',
    'aɪ',
    'v',
    'ʊ',
    'p',
    'ts',
    'z',
    'ç',
    'ɔ',
    'ŋ',
    'h',
    'uː',
    'aʊ',
    'j',
    'y',
    'yː',
    'x',
    'ɑ',
    'əl',
    'ɛː',
    'ɔø',
    'øː',
    'œ',
    'tʃ',
    'pf',
    'th',
    'aɪə',
    'ərɜ',
    'ɛɪ',
    'ph',
    'dʒ',
    'ja',
    'ʒ',
    'kh',
    'ɑ̃',
    'w',
    'i',
    'tsh',
    'ɔ̃',
  ],
  en: [
    'n',
    'ɪ',
    's',
    't',
    'k',
    'ɹ',
    'd',
    'l',
    'ə',
    'm',
    'ɛ',
    'p',
    'z',
    'æ',
    'ɚ',
    'eɪ',
    'b',
    'ᵻ',
    'f',
    'ŋ',
    'i',
    'iː',
    'ɑː',
    'v',
    'ʃ',
    'aɪ',
    'oʊ',
    'əl',
    'ʌ',
    'ɾ',
    'uː',
    'ɡ',
    'dʒ',
    'w',
    'h',
    'ɐ',
    'j',
    'ɜː',
    'tʃ',
    'ts',
    'ɑːɹ',
    'ɛɹ',
    'aʊ',
    'θ',
    'ɔːɹ',
    'oːɹ',
    'ɔː',
    'iə',
    'ʊ',
    'ɪɹ',
    'ɔ',
    'ɔɪ',
    'ʊɹ',
    'ʒ',
    'ð',
    'aɪə',
    'aɪɚ',
    'ʔ',
    'n̩',
    'th',
    'pf',
    'x',
    'kh',
    'ph',
  ],
};

const groupTokens = (language: SpeakLanguage): string[] =>
  [...PRONUNCIATION_GROUPS[language], { pairs: RECOGNIZER_TOLERANCE[language] }]
    .flatMap((group) => group.pairs)
    .flatMap((pair) => [pair.target, pair.spoken]);

const knownTokens = (language: SpeakLanguage): string[] => [
  ...Object.keys(SPEAK_SOUND_EXAMPLES[language]),
  ...SPEAK_HEARD_ONLY_SOUNDS[language],
];

describe('pronunciationSoundNames', () => {
  describe.each(SPEAK_LANGUAGES.map((language) => ({ language })))(
    '$language',
    ({ language }) => {
      it('names every sound its references use', () => {
        const missing = MEASURED_REFERENCE_TOKENS[language].filter(
          (token) => !isKnownSpeakSound(language, token)
        );
        expect(missing).toEqual([]);
      });

      it('names every sound in its groups and tolerance pairs', () => {
        const missing = groupTokens(language).filter(
          (token) => !isKnownSpeakSound(language, token)
        );
        expect(missing).toEqual([]);
      });

      it('gives every known sound a name and hint in all four locales', () => {
        for (const token of knownTokens(language)) {
          for (const locale of SOUND_NAME_LOCALES) {
            const sound = speakSoundName(language, token, locale);
            expect(sound.known, `${language} ${token}`).toBe(true);
            expect(
              sound.name.trim(),
              `${language} ${token} ${locale}`
            ).not.toBe('');
            expect(
              sound.hint.trim(),
              `${language} ${token} ${locale}`
            ).not.toBe('');
          }
        }
      });

      it('only lists tokens from the recognizer vocabulary', () => {
        const outside = knownTokens(language).filter(
          (token) => !(token in vocab)
        );
        expect(outside).toEqual([]);
      });

      it('keeps heard-only sounds apart from sounds with examples', () => {
        const both = SPEAK_HEARD_ONLY_SOUNDS[language].filter(
          (token) => token in SPEAK_SOUND_EXAMPLES[language]
        );
        expect(both).toEqual([]);
      });
    }
  );

  it('falls back to a plain name for every recognizer nucleus', () => {
    for (const language of SPEAK_LANGUAGES) {
      for (const token of nucleiFile.nuclei) {
        for (const locale of SOUND_NAME_LOCALES) {
          expect(speakSoundName(language, token, locale).name.trim()).not.toBe(
            ''
          );
        }
      }
    }
  });

  it('gives each sound its own example word', () => {
    for (const language of SPEAK_LANGUAGES) {
      const words = Object.values(SPEAK_SOUND_EXAMPLES[language]);
      expect(words.length).toBe(new Set(words).size);
    }
  });

  it('ignores object prototype keys', () => {
    expect(speakSoundName('en', 'constructor', 'en').known).toBe(false);
    expect(isKnownSpeakSound('en', 'toString')).toBe(false);
  });

  it('never shows the symbol for an unlisted sound', () => {
    const sound = speakSoundName('es', 'iou1', 'en');
    expect(sound).toEqual({
      name: 'This sound',
      hint: '',
      example: null,
      known: false,
    });
  });

  it('uses the language override over the shared name', () => {
    expect(speakSoundName('es', 'ð', 'en').name).toBe('Soft d');
    expect(speakSoundName('en', 'ð', 'en').name).toBe('Voiced th');
    expect(speakSoundName('es', 'r', 'en')).toMatchObject({
      name: 'Rolled r',
      example: 'perro',
    });
  });

  it('keeps every string short and free of em dashes', () => {
    for (const language of SPEAK_LANGUAGES) {
      for (const token of knownTokens(language)) {
        for (const locale of SOUND_NAME_LOCALES) {
          const { name, hint } = speakSoundName(language, token, locale);
          for (const text of [name, hint]) {
            expect(text).not.toContain('—');
            expect(text.split(/\s+/).length).toBeLessThan(30);
          }
        }
      }
    }
  });

  it('reads the UI locale from a language tag', () => {
    expect(soundNameLocale('es-MX')).toBe('es');
    expect(soundNameLocale('DE')).toBe('de');
    expect(soundNameLocale('pt-BR')).toBe('en');
    expect(soundNameLocale(undefined)).toBe('en');
  });
});

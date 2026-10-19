import { describe, expect, it } from 'vitest';
import samples from '@/tests/fixtures/pronunciation/espeak-group-samples.json';
import { tokenizeIpa } from '@/utils/pronunciation/tokenizeIpa';
import {
  PRONUNCIATION_GROUPS,
  RECOGNIZER_TOLERANCE,
  SPEAK_LANGUAGES,
} from './pronunciationGroups';
import type { SpeakLanguage } from '@/types';

const VOICES: Record<SpeakLanguage, Array<keyof typeof samples>> = {
  es: ['es-419', 'es'],
  de: ['de'],
  en: ['en'],
};

// Tokens espeak actually emits per language, with `$` marking a word-final occurrence.
function emitted(language: SpeakLanguage): Set<string> {
  const seen = new Set<string>();
  for (const voice of VOICES[language]) {
    for (const ipa of Object.values(samples[voice] as Record<string, string>)) {
      const r = tokenizeIpa(ipa);
      if (!r.ok) continue;
      r.tokens.forEach((t, i) => {
        seen.add(t);
        if (i === r.tokens.length - 1) seen.add(`${t}$`);
      });
    }
  }
  return seen;
}

describe('group targets appear in real espeak references', () => {
  it.each(SPEAK_LANGUAGES)('%s', (language) => {
    const seen = emitted(language);
    const dead = [
      ...PRONUNCIATION_GROUPS[language].flatMap((g) =>
        g.pairs.map((p) => ({ id: g.id, ...p }))
      ),
      ...RECOGNIZER_TOLERANCE[language].map((p) => ({ id: 'tolerance', ...p })),
    ]
      .filter((p) => !seen.has(p.final ? `${p.target}$` : p.target))
      .map((p) => `${p.id}: ${p.target}>${p.spoken}`);
    expect(dead).toEqual([]);
  });
});

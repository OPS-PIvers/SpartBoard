import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { computeLetterSpans } from './letterSpans';
import { computeSpeakReferences } from './lookup';
import type { SpeakDialect, SpeakLanguage } from './types';

vi.mock('./voiceRefs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./voiceRefs')>()),
  createVoiceReader: () => ({ read: () => Promise.resolve([]) }),
}));

const sample = JSON.parse(
  readFileSync(resolve(__dirname, 'testdata/letterSpanSample.json'), 'utf8')
) as Record<SpeakLanguage, string[]>;

const DIALECTS: Record<SpeakLanguage, SpeakDialect[]> = {
  es: ['es-419', 'es-ES'],
  de: ['de-DE'],
  en: ['en-US'],
};

const spelled = (text: string, tokens: string[], spans: number[]) =>
  tokens
    .map((t, i) => `${t}=${text.slice(spans[i * 2], spans[i * 2 + 1])}`)
    .join(' ');

describe('computeLetterSpans', () => {
  it('maps digraphs, silent letters and letter groups', () => {
    const cases: Array<[SpeakLanguage, string, string[], string]> = [
      [
        'es',
        'quieran',
        ['k', 'j', 'e', 'ɾ', 'a', 'n'],
        'k=qu j=i e=e ɾ=r a=a n=n',
      ],
      [
        'es',
        'examen',
        ['e', 'k', 's', 'a', 'm', 'e', 'n'],
        'e=e k=x s=x a=a m=m e=e n=n',
      ],
      ['de', 'schreib', ['ʃ', 'r', 'aɪ', 'p'], 'ʃ=sch r=r aɪ=ei p=b'],
      ['en', 'knight', ['n', 'aɪ', 't'], 'n=kn aɪ=igh t=t'],
      ['en', 'make', ['m', 'eɪ', 'k'], 'm=m eɪ=a k=k'],
    ];
    for (const [lang, word, tokens, expected] of cases) {
      const spans = computeLetterSpans(word, tokens, lang);
      expect(spans && spelled(word, tokens, spans)).toBe(expected);
    }
  });

  it('indexes into the original text, accents and capitals included', () => {
    expect(
      computeLetterSpans('Árbol', ['a', 'ɾ', 'β', 'o', 'l'], 'es')
    ).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  });

  it('gives up rather than guess', () => {
    expect(computeLetterSpans('xyz', ['a', 'e', 'i', 'o'], 'es')).toBeNull();
  });

  it.each(['es', 'de', 'en'] as const)(
    'covers at least 95%% of the %s sample',
    async (language) => {
      const out = await computeSpeakReferences({
        language,
        dialects: DIALECTS[language],
        terms: sample[language].map((term, i) => ({ cardId: `c${i}`, term })),
      });
      const refs = Object.values(out.cards).flatMap((c) => c.refs);
      const covered = refs.filter((r) => r.letterSpans).length;
      expect(sample[language]).toHaveLength(200);
      expect(covered / refs.length).toBeGreaterThanOrEqual(0.95);
      for (const r of refs) {
        if (r.letterSpans)
          expect(r.letterSpans).toHaveLength(r.tokens.length * 2);
      }
    }
  );
});

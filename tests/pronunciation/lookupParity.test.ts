import { describe, expect, it } from 'vitest';
import vocab from '@/utils/pronunciation/xlsr53EspeakVocab.json';
import nuclei from '@/utils/pronunciation/xlsr53Nuclei.json';
import { tokenizeIpa as clientTokenize } from '@/utils/pronunciation/tokenizeIpa';
import {
  NUCLEUS_TOKENS,
  VOCAB_TOKENS,
} from '@/functions/src/pronunciation/vocab';
import { tokenizeIpa as serverTokenize } from '@/functions/src/pronunciation/tokenizeIpa';

describe('Speak lookup client/server parity', () => {
  it('copies the model vocabulary and nuclei exactly', () => {
    const ids = vocab as Record<string, number>;
    expect(VOCAB_TOKENS).toEqual(
      Object.keys(ids).sort((a, b) => ids[a] - ids[b])
    );
    expect(NUCLEUS_TOKENS).toEqual(nuclei.nuclei);
  });

  it('tokenizes espeak IPA the same way on both sides', () => {
    const fixed = [
      'pˈero',
      'mjˈuːzɪk',
      'tˈa‍ɪm',
      'ˌɪntɚnˈæʃənəl',
      '(en)bˈeɪbi(de)',
      'dˈ??ç',
      'kˈæ§t',
      '',
      'ˈ',
      'xenjˈal',
      'ˌemfeɾmˈeɾa',
    ];
    // Deterministic random strings of real tokens and stress marks.
    let seed = 2383;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const generated = Array.from({ length: 2000 }, () =>
      Array.from({ length: 1 + rand(10) }, () => {
        const mark = ['', '', '', 'ˈ', 'ˌ'][rand(5)];
        return mark + VOCAB_TOKENS[4 + rand(VOCAB_TOKENS.length - 4)];
      }).join('')
    );
    for (const ipa of [...fixed, ...generated]) {
      expect(serverTokenize(ipa)).toEqual(clientTokenize(ipa));
    }
  });
});

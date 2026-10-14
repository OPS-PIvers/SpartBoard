import { describe, expect, it } from 'vitest';
import { tokenizeIpa } from './tokenizeIpa';

describe('tokenizeIpa (#2383)', () => {
  it('tokenizes Spanish with the trill and tap as single tokens', () => {
    expect(tokenizeIpa('pˈero')).toEqual({
      ok: true,
      tokens: ['p', 'e', 'r', 'o'],
      syllableCount: 2,
      primary: [1],
      languageSwitches: [],
    });
    expect(tokenizeIpa('pˈeɾo').ok && tokenizeIpa('pˈeɾo')).toMatchObject({
      tokens: ['p', 'e', 'ɾ', 'o'],
    });
  });

  it('finds j uː where greedy matching strands the length mark', () => {
    expect(tokenizeIpa('jˈuː')).toMatchObject({
      ok: true,
      tokens: ['j', 'uː'],
    });
    expect(tokenizeIpa('mjˈuːzɪk')).toMatchObject({
      ok: true,
      tokens: ['m', 'j', 'uː', 'z', 'ɪ', 'k'],
      primary: [1],
    });
  });

  it('strips the zero-width joiner espeak writes inside diphthongs', () => {
    expect(tokenizeIpa('tˈa‍ɪm')).toMatchObject({
      ok: true,
      tokens: ['t', 'aɪ', 'm'],
      syllableCount: 1,
    });
  });

  it('keeps the primary stress syllable and discards secondary', () => {
    expect(tokenizeIpa('ˌɪntɚnˈæʃənəl')).toMatchObject({
      ok: true,
      primary: [3],
    });
  });

  it('never lets a token span a stress mark', () => {
    expect(tokenizeIpa('xenjˈal')).toMatchObject({
      ok: true,
      tokens: ['x', 'e', 'n', 'j', 'a', 'l'],
      primary: [2],
    });
  });

  it('reports a loanword language switch for the teacher instead of hiding it', () => {
    expect(tokenizeIpa('(en)bˈeɪbi(de)')).toMatchObject({
      ok: true,
      tokens: ['b', 'eɪ', 'b', 'i'],
      languageSwitches: ['en'],
    });
  });

  it("refuses espeak's unrenderable ? rather than storing a partial reference", () => {
    expect(tokenizeIpa('dˈ??ç')).toEqual({ ok: false, reason: 'unrenderable' });
  });

  it('fails loudly, naming where, when no tokenization exists', () => {
    expect(tokenizeIpa('pˈeЖo')).toEqual({
      ok: false,
      reason: 'untokenizable',
      at: 2,
      rest: 'Жo',
    });
    expect(tokenizeIpa('ˈ')).toEqual({ ok: false, reason: 'empty' });
  });
});

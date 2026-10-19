import { describe, expect, it } from 'vitest';
import {
  cmudictStress,
  disagreesWithCmudict,
  lookupCmudict,
  parseCmudict,
} from './cmudict';

describe('CMUDict cross-check', () => {
  it('reads variants and stress digits', () => {
    const dict = parseCmudict(
      'record R EH1 K ER0 D\nrecord(2) R IH0 K AO1 R D # verb\n'
    );
    expect(dict.get('record')).toHaveLength(2);
    expect(cmudictStress(dict.get('record') ?? [], 2)).toEqual({
      syllableCount: 2,
      primary: [1, 2],
    });
  });

  it('loads the committed dictionary', () => {
    expect(lookupCmudict('Camera')).not.toBeNull();
    expect(lookupCmudict('piñata')).toBeNull();
  });

  it('ignores notation differences and catches segment errors', () => {
    const v = (w: string) => lookupCmudict(w) ?? [];
    expect(disagreesWithCmudict('wˈɔːɾɚ', v('water'))).toBe(false);
    expect(disagreesWithCmudict('ɛɡzˈæmpəl', v('example'))).toBe(false);
    expect(disagreesWithCmudict('hˈʌsbənd', v('husband'))).toBe(true);
  });
});

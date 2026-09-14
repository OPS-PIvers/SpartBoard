import { describe, expect, it } from 'vitest';
import { languageNativeLabel } from './languageNativeLabel';

describe('languageNativeLabel', () => {
  it('uses the hard-coded native label for Spanish', () => {
    expect(languageNativeLabel('es')).toBe('Español');
  });

  it('names Somali natively', () => {
    expect(languageNativeLabel('so')).toBe('Soomaali');
  });

  it('names Hmong natively where Intl has no ICU data', () => {
    expect(languageNativeLabel('hmn')).toBe('Hmoob');
  });

  it('falls back to the raw tag for an unknown language', () => {
    expect(languageNativeLabel('zz')).toBe('zz');
  });

  it('returns a hostile-but-regex-valid tag unchanged rather than throwing', () => {
    const tag = 'aa-' + 'ZZZZZZZZ-'.repeat(4) + 'ZZ';
    expect(languageNativeLabel(tag)).toBe(tag);
  });

  it('trims surrounding whitespace before resolving', () => {
    expect(languageNativeLabel('  es  ')).toBe('Español');
  });
});

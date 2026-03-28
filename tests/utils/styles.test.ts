import { describe, it, expect } from 'vitest';
import { getFontClass } from '@/utils/styles';

describe('styles utility', () => {
  describe('getFontClass', () => {
    it('returns global font class when fontFamily is global', () => {
      expect(getFontClass('global', 'roboto')).toBe('font-roboto');
    });

    it('returns original font class when it already starts with font-', () => {
      expect(getFontClass('font-inter', 'roboto')).toBe('font-inter');
    });

    it('prefixes fontFamily with font- when it does not start with font-', () => {
      expect(getFontClass('inter', 'roboto')).toBe('font-inter');
    });
  });
});

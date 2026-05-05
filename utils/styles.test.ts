import { describe, it, expect } from 'vitest';
import { getFontClass, hexToRgba } from './styles';

describe('styles', () => {
  describe('getFontClass', () => {
    it("returns font- class for 'global' fontFamily", () => {
      expect(getFontClass('global', 'roboto')).toBe('font-roboto');
    });

    it("returns fontFamily as is if it already starts with 'font-'", () => {
      expect(getFontClass('font-inter', 'roboto')).toBe('font-inter');
    });

    it("prefixes fontFamily with 'font-' if not already prefixed", () => {
      expect(getFontClass('montserrat', 'roboto')).toBe('font-montserrat');
    });
  });

  describe('hexToRgba', () => {
    it('converts 6-digit hex with #', () => {
      expect(hexToRgba('#ff0000', 1)).toBe('rgba(255, 0, 0, 1)');
    });

    it('converts 6-digit hex without #', () => {
      expect(hexToRgba('00ff00', 0.5)).toBe('rgba(0, 255, 0, 0.5)');
    });

    it('converts 3-digit hex with #', () => {
      expect(hexToRgba('#f00', 1)).toBe('rgba(255, 0, 0, 1)');
    });

    it('converts 3-digit hex without #', () => {
      expect(hexToRgba('0f0', 0.8)).toBe('rgba(0, 255, 0, 0.8)');
    });

    it('handles undefined hex with fallback to white', () => {
      expect(hexToRgba(undefined, 1)).toBe('rgba(255, 255, 255, 1)');
    });

    it('handles invalid hex length with fallback to white', () => {
      expect(hexToRgba('#ff', 1)).toBe('rgba(255, 255, 255, 1)');
      expect(hexToRgba('#ff00000', 1)).toBe('rgba(255, 255, 255, 1)');
    });

    it('handles invalid hex characters with fallback to white', () => {
      expect(hexToRgba('#zz0000', 1)).toBe('rgba(255, 255, 255, 1)');
    });

    it('clamps alpha between 0 and 1', () => {
      expect(hexToRgba('#ffffff', -0.5)).toBe('rgba(255, 255, 255, 0)');
      expect(hexToRgba('#ffffff', 1.5)).toBe('rgba(255, 255, 255, 1)');
    });

    it('handles NaN or non-number alpha with fallback to 1', () => {
      expect(hexToRgba('#ffffff', NaN)).toBe('rgba(255, 255, 255, 1)');
      // @ts-expect-error - testing invalid input
      expect(hexToRgba('#ffffff', '0.5')).toBe('rgba(255, 255, 255, 1)');
    });
  });
});

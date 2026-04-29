import { describe, it, expect } from 'vitest';
import {
  isExternalBackground,
  isCustomBackground,
  getCustomBackgroundStyle,
} from './backgrounds';

describe('backgrounds', () => {
  describe('isExternalBackground', () => {
    it('returns true for http URLs', () => {
      expect(isExternalBackground('http://example.com/image.png')).toBe(true);
    });

    it('returns true for https URLs', () => {
      expect(isExternalBackground('https://example.com/image.png')).toBe(true);
    });

    it('returns true for data URIs', () => {
      expect(
        isExternalBackground('data:image/png;base64,iVBORw0KGgoAAAANSUhE')
      ).toBe(true);
    });

    it('returns true for blob URLs', () => {
      expect(isExternalBackground('blob:https://example.com/abc-123')).toBe(
        true
      );
    });

    it('returns false for Tailwind class strings', () => {
      expect(isExternalBackground('bg-slate-900')).toBe(false);
      expect(isExternalBackground('bg-gradient-to-br from-blue-500')).toBe(
        false
      );
    });

    it('returns false for custom: prefixed values', () => {
      expect(isExternalBackground('custom:#ff0000')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isExternalBackground('')).toBe(false);
    });
  });

  describe('isCustomBackground', () => {
    it('returns true for custom: prefixed values', () => {
      expect(isCustomBackground('custom:#ff0000')).toBe(true);
      expect(
        isCustomBackground('custom:linear-gradient(45deg, red, blue)')
      ).toBe(true);
    });

    it('returns false for Tailwind class strings', () => {
      expect(isCustomBackground('bg-slate-900')).toBe(false);
    });

    it('returns false for URLs', () => {
      expect(isCustomBackground('https://example.com/image.png')).toBe(false);
      expect(isCustomBackground('data:image/png;base64,abc')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isCustomBackground('')).toBe(false);
    });

    it('is case sensitive — only lowercase "custom:" matches', () => {
      expect(isCustomBackground('Custom:#ff0000')).toBe(false);
      expect(isCustomBackground('CUSTOM:#ff0000')).toBe(false);
    });
  });

  describe('getCustomBackgroundStyle', () => {
    it('returns backgroundColor for 6-digit hex', () => {
      expect(getCustomBackgroundStyle('custom:#ff0000')).toEqual({
        backgroundColor: '#ff0000',
      });
    });

    it('returns backgroundColor for 3-digit hex', () => {
      expect(getCustomBackgroundStyle('custom:#f00')).toEqual({
        backgroundColor: '#f00',
      });
    });

    it('accepts uppercase hex', () => {
      expect(getCustomBackgroundStyle('custom:#FF00AA')).toEqual({
        backgroundColor: '#FF00AA',
      });
    });

    it('accepts mixed-case hex', () => {
      expect(getCustomBackgroundStyle('custom:#Ff00aA')).toEqual({
        backgroundColor: '#Ff00aA',
      });
    });

    it('returns backgroundColor for rgb() values', () => {
      expect(getCustomBackgroundStyle('custom:rgb(255, 0, 0)')).toEqual({
        backgroundColor: 'rgb(255, 0, 0)',
      });
    });

    it('returns backgroundColor for rgba() values', () => {
      expect(getCustomBackgroundStyle('custom:rgba(255, 0, 0, 0.5)')).toEqual({
        backgroundColor: 'rgba(255, 0, 0, 0.5)',
      });
    });

    it('returns background shorthand for linear-gradient values', () => {
      const value = 'linear-gradient(45deg, red, blue)';
      expect(getCustomBackgroundStyle(`custom:${value}`)).toEqual({
        background: value,
      });
    });

    it('returns empty object for invalid hex (wrong length)', () => {
      expect(getCustomBackgroundStyle('custom:#12345')).toEqual({});
      expect(getCustomBackgroundStyle('custom:#1234567')).toEqual({});
    });

    it('returns empty object for invalid hex (non-hex chars)', () => {
      expect(getCustomBackgroundStyle('custom:#zzzzzz')).toEqual({});
    });

    it('returns empty object for unrecognised formats', () => {
      expect(
        getCustomBackgroundStyle('custom:radial-gradient(red, blue)')
      ).toEqual({});
      expect(getCustomBackgroundStyle('custom:not-a-color')).toEqual({});
    });

    it('returns empty object when value after prefix is empty', () => {
      expect(getCustomBackgroundStyle('custom:')).toEqual({});
    });
  });
});

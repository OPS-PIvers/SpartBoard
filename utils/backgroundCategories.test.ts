import { describe, it, expect } from 'vitest';
import { resolveCategory } from './backgroundCategories';

describe('backgroundCategories', () => {
  describe('resolveCategory', () => {
    describe('admin override', () => {
      it('returns canonical category when adminCategory matches exactly', () => {
        expect(resolveCategory('Any Label', 'Nature')).toBe('Nature');
      });

      it('normalises casing when adminCategory matches a known category case-insensitively', () => {
        expect(resolveCategory('Any Label', 'nature')).toBe('Nature');
        expect(resolveCategory('Any Label', 'SPACE')).toBe('Space');
      });

      it('trims whitespace from adminCategory', () => {
        expect(resolveCategory('Any Label', '  Nature  ')).toBe('Nature');
      });

      it('returns adminCategory as-is if it is not a known category', () => {
        expect(resolveCategory('Any Label', 'Custom Category')).toBe(
          'Custom Category'
        );
      });
    });

    describe('keyword matching', () => {
      it('matches Classroom keywords', () => {
        expect(resolveCategory('chalkboard background')).toBe('Classroom');
        expect(resolveCategory('school room')).toBe('Classroom');
        expect(resolveCategory('blackboard style')).toBe('Classroom');
      });

      it('matches Landmarks keywords', () => {
        expect(resolveCategory('the eiffel tower')).toBe('Landmarks');
        expect(resolveCategory('pyramid of giza')).toBe('Landmarks');
        expect(resolveCategory('machu picchu')).toBe('Landmarks');
        expect(resolveCategory('chichén itzá')).toBe('Landmarks');
        expect(resolveCategory('chichen itza')).toBe('Landmarks');
      });

      it('matches Nature keywords', () => {
        expect(resolveCategory('beautiful forest')).toBe('Nature');
        expect(resolveCategory('sunny beach')).toBe('Nature');
        expect(resolveCategory('mountain range')).toBe('Nature');
      });

      it('matches Space keywords', () => {
        expect(resolveCategory('deep space')).toBe('Space');
        expect(resolveCategory('galaxy nebula')).toBe('Space');
        expect(resolveCategory('planet earth')).toBe('Space');
      });

      it('matches Abstract keywords', () => {
        expect(resolveCategory('abstract pattern')).toBe('Abstract');
        expect(resolveCategory('geometric shapes')).toBe('Abstract');
        expect(resolveCategory('minimal texture')).toBe('Abstract');
      });

      it('matches Seasonal keywords', () => {
        expect(resolveCategory('winter snow')).toBe('Seasonal');
        expect(resolveCategory('autumn leaves')).toBe('Seasonal');
        expect(resolveCategory('christmas tree')).toBe('Seasonal');
      });

      it('is case-insensitive for keywords', () => {
        expect(resolveCategory('FOREST')).toBe('Nature');
        expect(resolveCategory('Eiffel')).toBe('Landmarks');
      });
    });

    describe('fallback', () => {
      it('returns "General" if no keywords match and no admin override is provided', () => {
        expect(resolveCategory('some random label')).toBe('General');
      });

      it('returns "General" for empty label', () => {
        expect(resolveCategory('')).toBe('General');
      });
    });
  });
});

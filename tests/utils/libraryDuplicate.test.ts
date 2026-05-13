import { describe, expect, it } from 'vitest';
import {
  buildDuplicateAction,
  suggestDuplicateTitle,
} from '@/components/common/library/libraryDuplicate';

describe('libraryDuplicate', () => {
  describe('suggestDuplicateTitle', () => {
    it('appends " (Copy)" to a clean title', () => {
      expect(suggestDuplicateTitle('My Quiz')).toBe('My Quiz (Copy)');
    });

    it('bumps " (Copy)" → " (Copy 2)"', () => {
      expect(suggestDuplicateTitle('My Quiz (Copy)')).toBe('My Quiz (Copy 2)');
    });

    it('bumps " (Copy 2)" → " (Copy 3)" (preserves base)', () => {
      expect(suggestDuplicateTitle('My Quiz (Copy 2)')).toBe(
        'My Quiz (Copy 3)'
      );
    });

    it('handles whitespace-only input → "Copy"', () => {
      expect(suggestDuplicateTitle('   ')).toBe('Copy');
    });

    it('handles empty string → "Copy" (no leading space)', () => {
      expect(suggestDuplicateTitle('')).toBe('Copy');
    });

    it('trims leading/trailing whitespace before appending', () => {
      expect(suggestDuplicateTitle('  My Quiz  ')).toBe('My Quiz (Copy)');
    });

    it('does NOT misinterpret natural parenthetical suffix like "(Final)"', () => {
      // "(Final)" doesn't match the Copy regex, so it's treated as part
      // of the base name and " (Copy)" appends.
      expect(suggestDuplicateTitle('My Quiz (Final)')).toBe(
        'My Quiz (Final) (Copy)'
      );
    });

    it('non-numeric "(Copy XYZ)" suffix is treated as part of base', () => {
      // Regex requires \d+ for the counter group, so "(Copy XYZ)" doesn't
      // match — falls through to the plain "(Copy)" append.
      expect(suggestDuplicateTitle('My Quiz (Copy XYZ)')).toBe(
        'My Quiz (Copy XYZ) (Copy)'
      );
    });

    it('nested "(Copy) (Copy)" only bumps the trailing suffix', () => {
      // The regex's anchored end + non-greedy base means the LAST `(Copy)`
      // is what gets bumped. Documented in the implementation comment.
      expect(suggestDuplicateTitle('Foo (Copy) (Copy)')).toBe(
        'Foo (Copy) (Copy 2)'
      );
    });

    it('handles "(Copy 0)" edge case', () => {
      expect(suggestDuplicateTitle('Foo (Copy 0)')).toBe('Foo (Copy 1)');
    });
  });

  describe('buildDuplicateAction', () => {
    it('returns a LibraryMenuAction with id namespaced to the item id', () => {
      const action = buildDuplicateAction(
        { id: 'quiz-123', title: 'Some Quiz' },
        () => undefined
      );
      expect(action.id).toBe('duplicate-quiz-123');
      expect(action.label).toBe('Duplicate');
      expect(action.icon).toBeDefined();
    });

    it('invokes the duplicate handler on click', () => {
      let called = 0;
      const action = buildDuplicateAction({ id: 'x' }, () => {
        called++;
      });
      action.onClick();
      expect(called).toBe(1);
    });

    it('accepts an async duplicate handler', () => {
      let resolved = false;
      const action = buildDuplicateAction({ id: 'x' }, async () => {
        await Promise.resolve();
        resolved = true;
      });
      action.onClick();
      // Synchronous return — the void-wrapped promise resolves on next tick.
      return new Promise<void>((done) => {
        setTimeout(() => {
          expect(resolved).toBe(true);
          done();
        }, 10);
      });
    });

    it('honors custom label and disabled options', () => {
      const action = buildDuplicateAction({ id: 'x' }, () => undefined, {
        label: 'Clone',
        disabled: true,
        disabledReason: 'A duplication is already in flight',
      });
      expect(action.label).toBe('Clone');
      expect(action.disabled).toBe(true);
      expect(action.disabledReason).toBe('A duplication is already in flight');
    });
  });
});

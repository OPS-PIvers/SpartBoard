import { describe, expect, it } from 'vitest';
import {
  LIBRARY_ITEM_NOUNS,
  libraryDeleteConfirmCopy,
} from './libraryDeleteConfirmCopy';

describe('libraryDeleteConfirmCopy', () => {
  it('names a single item in the title', () => {
    expect(
      libraryDeleteConfirmCopy({
        titles: ['Unit 3 review'],
        noun: LIBRARY_ITEM_NOUNS.quiz,
      })
    ).toEqual({
      title: 'Delete "Unit 3 review"?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
    });
  });

  it('counts several items in the title and button', () => {
    expect(
      libraryDeleteConfirmCopy({
        titles: ['A', 'B', 'C'],
        noun: LIBRARY_ITEM_NOUNS.miniApp,
      })
    ).toEqual({
      title: 'Delete 3 Mini Apps?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete 3 Mini Apps',
    });
  });

  it('puts the widget consequence before the undo line', () => {
    expect(
      libraryDeleteConfirmCopy({
        titles: ['Fractions'],
        noun: LIBRARY_ITEM_NOUNS.bank,
        detail: 'Quizzes that draw from it will stop resolving.',
      }).message
    ).toBe(
      'Quizzes that draw from it will stop resolving. This cannot be undone.'
    );
  });

  it('falls back to the noun when the title is blank', () => {
    expect(
      libraryDeleteConfirmCopy({
        titles: [' '],
        noun: LIBRARY_ITEM_NOUNS.guidedLearning,
      }).title
    ).toBe('Delete this Guided Learning set?');
  });
});

import { defineFixtures } from './types';
import { STRESS } from './stress';

const ALL = [
  'computer',
  'chromebook',
  'pencil',
  'notebook',
  'learn_book',
  'math_journal',
  'paper',
  'phone',
  'textbook',
  'book_to_read',
  'ipad',
  'headphones',
  'water',
  'scissors',
  'markers',
  'calculator',
  'book_bin',
];

export const materialsFixtures = defineFixtures<'materials'>({
  empty: { config: { selectedItems: [], activeItems: [] } },
  typical: {
    config: {
      selectedItems: ['pencil', 'notebook', 'chromebook', 'calculator'],
      activeItems: ['pencil', 'notebook'],
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      selectedItems: ALL,
      activeItems: ALL.filter((_, i) => i % 2 === 0),
      title: STRESS.title,
    },
  },
});

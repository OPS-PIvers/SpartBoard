import type { FlashcardSet } from '@/types';
import { defineFixtures, userPath } from './types';
import { STRESS, range } from './stress';

const T0 = Date.UTC(2026, 8, 1, 14, 0);

const makeSet = (
  id: string,
  title: string,
  cardCount: number,
  i: number
): FlashcardSet => ({
  id,
  title,
  description: '',
  termLanguage: 'en-US',
  definitionLanguage: 'en-US',
  cards: range(cardCount, (c) => ({
    id: `${id}-card-${c}`,
    term: `Term ${c + 1}`,
    definition: `Definition ${c + 1}`,
  })),
  folderId: null,
  createdAt: T0 - i * 86_400_000,
  updatedAt: T0 - i * 86_400_000,
});

const docsFor = (
  sets: FlashcardSet[]
): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    sets.map((set) => [userPath(`flashcard_sets/${set.id}`), { ...set }])
  );

export const flashcardsFixtures = defineFixtures<'flashcards'>({
  empty: { config: { view: 'library' } },
  typical: {
    firestoreDocs: docsFor(
      [
        'Cell parts',
        'Spanish: food',
        'Fractions vocabulary',
        'Civil War dates',
      ].map((title, i) => makeSet(`set-${i}`, title, 8 + i * 3, i))
    ),
    config: { view: 'library' },
  },
  stress: {
    firestoreDocs: docsFor(
      range(STRESS.itemCount, (i) =>
        makeSet(
          `set-${i}`,
          i % 2 === 0 ? STRESS.title : STRESS.word,
          i === 0 ? 500 : 5 + i,
          i
        )
      )
    ),
    config: { view: 'library' },
  },
});

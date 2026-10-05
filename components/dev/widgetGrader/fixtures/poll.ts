import { defineFixtures } from './types';
import { STRESS, range } from './stress';

export const pollFixtures = defineFixtures<'poll'>({
  empty: { config: { questions: [{ id: 'q-1', question: '', options: [] }] } },
  typical: {
    config: {
      questions: [
        {
          id: 'q-1',
          question: 'Which lab should we do Friday?',
          options: [
            { id: 'opt-1', label: 'Density towers', votes: 9 },
            { id: 'opt-2', label: 'Egg drop', votes: 12 },
            { id: 'opt-3', label: 'Paper rockets', votes: 4 },
          ],
        },
      ],
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      questions: [
        {
          id: 'q-1',
          question: `${STRESS.sentence} ${STRESS.word}?`,
          options: range(STRESS.itemCount, (i) => ({
            id: `opt-${i}`,
            label: i % 2 === 0 ? STRESS.longLabel(i) : STRESS.word,
            votes: (i * 7) % 31,
          })),
        },
      ],
    },
  },
});

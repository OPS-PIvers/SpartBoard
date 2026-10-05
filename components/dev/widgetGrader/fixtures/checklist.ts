import { defineFixtures } from './types';
import { STRESS, STRESS_ROSTER, range } from './stress';

const TASKS = [
  'Turn in homework',
  'Get a calculator',
  'Open notebook to page 12',
  'Start warm-up',
  'Pair up for lab',
];

export const checklistFixtures = defineFixtures<'checklist'>({
  empty: { config: { items: [] } },
  typical: {
    config: {
      items: TASKS.map((text, i) => ({
        id: `item-${i}`,
        text,
        completed: i < 2,
      })),
    },
  },
  stress: {
    customTitle: STRESS.title,
    rosters: [STRESS_ROSTER],
    config: {
      items: range(STRESS.itemCount, (i) => ({
        id: `item-${i}`,
        text:
          i % 3 === 0
            ? STRESS.longLabel(i)
            : i % 3 === 1
              ? STRESS.word
              : STRESS.sentence,
        completed: i % 4 === 0,
      })),
    },
  },
});

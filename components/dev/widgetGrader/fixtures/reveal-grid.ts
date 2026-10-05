import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const PAIRS = [
  ['Photosynthesis', 'Plants turn light into sugar'],
  ['Mitosis', 'One cell splits into two'],
  ['Habitat', 'Where an organism lives'],
  ['Producer', 'Makes its own food'],
  ['Decomposer', 'Breaks down dead matter'],
  ['Predator', 'Hunts other animals'],
];

export const revealGridFixtures = defineFixtures<'reveal-grid'>({
  empty: { config: { columns: 3, cards: [], revealMode: 'flip' } },
  typical: {
    config: {
      columns: 3,
      revealMode: 'flip',
      cards: PAIRS.map(([front, back], i) => ({
        id: `card-${i}`,
        frontContent: front,
        backContent: back,
        isRevealed: i === 1,
      })),
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      columns: 5,
      revealMode: 'fade',
      cards: range(STRESS.itemCount, (i) => ({
        id: `card-${i}`,
        frontContent: i % 2 === 0 ? STRESS.word : STRESS.longLabel(i),
        backContent: STRESS.sentence,
        isRevealed: i % 3 === 0,
      })),
    },
  },
});

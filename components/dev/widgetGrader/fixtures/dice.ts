import { defineFixtures } from './types';
import { STRESS } from './stress';

export const diceFixtures = defineFixtures<'dice'>({
  empty: { config: { count: 1 } },
  typical: { config: { count: 2, lastRoll: [4, 2] } },
  stress: {
    customTitle: STRESS.title,
    config: { count: 6, lastRoll: [6, 5, 4, 3, 2, 1] },
  },
});

import { defineFixtures } from './types';
import { STRESS, STRESS_ROSTER, TYPICAL_ROSTER, makeRoster } from './stress';

export const classesFixtures = defineFixtures<'classes'>({
  empty: { config: {} },
  typical: {
    rosters: [
      TYPICAL_ROSTER,
      { ...makeRoster(22, 'Period 5 Science'), id: 'roster-22' },
    ],
    config: {},
  },
  stress: {
    customTitle: STRESS.title,
    rosters: [
      STRESS_ROSTER,
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
        ...makeRoster(20 + n, `${STRESS.word} Section ${n}`),
        id: `roster-stress-${n}`,
      })),
    ],
    config: {},
  },
});

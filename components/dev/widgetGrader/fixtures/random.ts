import { defineFixtures } from './types';
import { STRESS, STRESS_ROSTER, TYPICAL_ROSTER } from './stress';

export const randomFixtures = defineFixtures<'random'>({
  empty: { config: {} },
  typical: {
    rosters: [TYPICAL_ROSTER],
    config: {
      rosterMode: 'class',
      mode: 'single',
      lastResult: 'Harper Okafor',
    },
  },
  stress: {
    customTitle: STRESS.title,
    rosters: [STRESS_ROSTER],
    config: {
      rosterMode: 'class',
      mode: 'single',
      lastResult: `${STRESS_ROSTER.students[0].firstName} ${STRESS_ROSTER.students[0].lastName}`,
    },
  },
});

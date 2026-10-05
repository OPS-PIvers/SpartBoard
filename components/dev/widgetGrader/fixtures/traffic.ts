import { defineFixtures } from './types';
import { STRESS } from './stress';

export const trafficFixtures = defineFixtures<'traffic'>({
  empty: { config: {} },
  typical: { config: { active: 'green' } },
  stress: { customTitle: STRESS.title, config: { active: 'red' } },
});

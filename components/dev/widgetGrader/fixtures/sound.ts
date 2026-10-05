import { defineFixtures } from './types';
import { STRESS } from './stress';

export const soundFixtures = defineFixtures<'sound'>({
  empty: { config: {} },
  typical: { config: { visual: 'speedometer', sensitivity: 1.5 } },
  stress: {
    customTitle: STRESS.title,
    config: {
      visual: 'balls',
      sensitivity: 5,
      autoTrafficLight: true,
      trafficLightThreshold: 8,
      syncExpectations: true,
    },
  },
});

import { defineFixtures } from './types';
import { STRESS } from './stress';

export const weatherFixtures = defineFixtures<'weather'>({
  empty: { config: { isAuto: false } },
  typical: {
    config: {
      isAuto: false,
      temp: 54,
      feelsLike: 49,
      showFeelsLike: true,
      condition: 'cloudy',
      locationName: 'Orono, MN',
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      isAuto: false,
      temp: -23,
      feelsLike: -41,
      showFeelsLike: true,
      condition: 'snowy',
      locationName: `${STRESS.word}, ${STRESS.title}`,
    },
  },
});

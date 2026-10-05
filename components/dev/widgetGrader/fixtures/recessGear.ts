import { defineFixtures } from './types';
import { STRESS } from './stress';

export const recessGearFixtures = defineFixtures<'recessGear'>({
  empty: { config: {} },
  typical: { config: { useFeelsLike: true } },
  stress: {
    customTitle: STRESS.title,
    config: { useFeelsLike: false },
  },
});

import { defineFixtures } from './types';
import { STRESS } from './stress';

export const mathToolsFixtures = defineFixtures<'mathTools'>({
  empty: { config: {} },
  typical: { config: { dpiCalibration: 96 } },
  stress: {
    customTitle: STRESS.title,
    config: { dpiCalibration: 300 },
  },
});

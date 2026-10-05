import { defineFixtures } from './types';
import { STRESS } from './stress';

export const mathToolFixtures = defineFixtures<'mathTool'>({
  empty: { config: { toolType: 'ruler-in' } },
  typical: {
    config: {
      toolType: 'ruler-in',
      pixelsPerInch: 96,
      rulerUnits: 'both',
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      toolType: 'ruler-in',
      pixelsPerInch: 192,
      rulerUnits: 'cm',
      rotation: 45,
    },
  },
});

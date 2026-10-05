import { defineFixtures } from './types';
import { STRESS } from './stress';

export const breathingFixtures = defineFixtures<'breathing'>({
  empty: { config: {} },
  typical: {
    config: { pattern: '4-7-8', visual: 'lotus', color: '#14b8a6' },
  },
  stress: {
    customTitle: STRESS.title,
    config: { pattern: '5-5', visual: 'wave', color: '#ef4444' },
  },
});

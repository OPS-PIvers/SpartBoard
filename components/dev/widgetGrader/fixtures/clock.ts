import { defineFixtures } from './types';
import { STRESS } from './stress';

export const clockFixtures = defineFixtures<'clock'>({
  empty: { config: {} },
  typical: {
    config: { format24: false, showSeconds: false, clockStyle: 'modern' },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      format24: false,
      showSeconds: true,
      clockStyle: 'lcd',
      glow: true,
    },
  },
});

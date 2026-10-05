import { defineFixtures } from './types';
import { STRESS } from './stress';

export const talkingToolFixtures = defineFixtures<'talking-tool'>({
  empty: { config: {} },
  typical: { config: { cardColor: '#ffffff', cardOpacity: 1 } },
  stress: {
    customTitle: STRESS.title,
    config: { cardColor: '#fef3c7', cardOpacity: 0.8 },
  },
});

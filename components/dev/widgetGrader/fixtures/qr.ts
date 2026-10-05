import { defineFixtures } from './types';
import { STRESS } from './stress';

export const qrFixtures = defineFixtures<'qr'>({
  empty: { config: {} },
  typical: {
    config: { url: 'https://example.com/unit-3-resources', showUrl: true },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      url: `https://example.com/${STRESS.word}/${STRESS.maxText(400).replace(/ /g, '-')}`,
      showUrl: true,
    },
  },
});

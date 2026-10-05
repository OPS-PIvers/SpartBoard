import { defineFixtures } from './types';
import { STRESS } from './stress';

// Stations come from Firestore (empty cache here), so no station is ever resolved.
export const musicFixtures = defineFixtures<'music'>({
  empty: { config: { stationId: '' } },
  typical: {
    config: {
      stationId: 'station-lofi',
      layout: 'default',
      bgColor: '#ffffff',
      textColor: '#1e293b',
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      stationId: 'station-missing',
      layout: 'minimal',
      syncWithTimeTool: true,
    },
  },
});

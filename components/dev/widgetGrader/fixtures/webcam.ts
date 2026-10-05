import { defineFixtures } from './types';
import { STRESS } from './stress';

export const webcamFixtures = defineFixtures<'webcam'>({
  empty: { config: {} },
  typical: { config: { zoomLevel: 1.5, isMirrored: true } },
  stress: {
    customTitle: STRESS.title,
    config: {
      zoomLevel: 4,
      isMirrored: false,
      autoSendToNotes: true,
      deviceId: STRESS.word,
    },
  },
});

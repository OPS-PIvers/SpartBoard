import { defineFixtures } from './types';
import { STRESS } from './stress';

export const expectationsFixtures = defineFixtures<'expectations'>({
  empty: { config: {} },
  typical: {
    config: {
      voiceLevel: 2,
      workMode: 'partner',
      interactionMode: 'productive',
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      voiceLevel: 4,
      workMode: 'group',
      interactionMode: 'discussion',
      activeRoutines: ['chalk-talk', 'jigsaw', 'fishbowl', 'gallery-walk'],
      instructionalRoutine: STRESS.word,
      syncSoundWidget: true,
    },
  },
});

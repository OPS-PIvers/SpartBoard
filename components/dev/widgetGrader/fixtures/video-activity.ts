import { defineFixtures } from './types';
import { STRESS } from './stress';

// The library reads Firestore (empty cache here), so fixtures vary only the persisted view settings.
export const videoActivityFixtures = defineFixtures<'video-activity'>({
  empty: {
    config: {
      view: 'manager',
      selectedActivityId: null,
      selectedActivityTitle: null,
      resultsSessionId: null,
    },
  },
  typical: {
    config: {
      view: 'manager',
      selectedActivityId: null,
      selectedActivityTitle: null,
      resultsSessionId: null,
      libraryViewMode: 'grid',
      autoPlay: false,
      requireCorrectAnswer: true,
      allowSkipping: false,
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      view: 'manager',
      selectedActivityId: 'activity-stress',
      selectedActivityTitle: `${STRESS.title} ${STRESS.word}`,
      resultsSessionId: null,
      libraryViewMode: 'list',
      autoPlay: true,
      requireCorrectAnswer: true,
      allowSkipping: true,
    },
  },
});

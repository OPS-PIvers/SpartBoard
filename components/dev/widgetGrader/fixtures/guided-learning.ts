import { defineFixtures } from './types';
import { STRESS } from './stress';

// The library reads Firestore (empty cache here), so fixtures vary only the persisted view settings.
export const guidedLearningFixtures = defineFixtures<'guided-learning'>({
  empty: {
    config: { view: 'library', playerSetId: null, resultsSessionId: null },
  },
  typical: {
    config: {
      view: 'library',
      playerSetId: null,
      resultsSessionId: null,
      libraryViewMode: 'grid',
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      view: 'library',
      playerSetId: null,
      resultsSessionId: null,
      libraryViewMode: 'list',
    },
  },
});

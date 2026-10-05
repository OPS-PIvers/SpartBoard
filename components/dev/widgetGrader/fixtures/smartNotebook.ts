import { defineFixtures } from './types';
import { STRESS } from './stress';

// Notebooks live in the teacher's Drive, so the library shows its empty state.
export const smartNotebookFixtures = defineFixtures<'smartNotebook'>({
  empty: { config: {} },
  typical: { config: { libraryDisplayMode: 'cards' } },
  stress: {
    customTitle: STRESS.title,
    config: { libraryDisplayMode: 'list', storageLimitMb: 5 },
  },
});

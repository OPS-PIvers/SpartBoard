import { defineFixtures } from './types';
import { STRESS } from './stress';

// In bypass builds useCatalystSets always returns no sets, so every fixture shows the empty state.
export const catalystFixtures = defineFixtures<'catalyst'>({
  empty: { config: {} },
  typical: { config: {} },
  stress: { customTitle: STRESS.title, config: {} },
});

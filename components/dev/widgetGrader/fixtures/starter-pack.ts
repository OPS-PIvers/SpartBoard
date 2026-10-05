import { defineFixtures } from './types';
import { STRESS } from './stress';

// Packs come from Firestore (empty cache here), so every fixture shows the no-packs state.
export const starterPackFixtures = defineFixtures<'starter-pack'>({
  empty: { config: {} },
  typical: { config: {} },
  stress: { customTitle: STRESS.title, config: {} },
});

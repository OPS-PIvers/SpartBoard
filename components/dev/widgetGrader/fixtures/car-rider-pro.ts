import { defineFixtures } from './types';
import { STRESS } from './stress';

// The login URL comes from admin settings (not read here), so every fixture shows the disabled state.
export const carRiderProFixtures = defineFixtures<'car-rider-pro'>({
  empty: { config: {} },
  typical: { config: {} },
  stress: { customTitle: STRESS.title, config: {} },
});

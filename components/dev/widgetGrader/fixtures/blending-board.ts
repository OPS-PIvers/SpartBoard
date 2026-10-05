import { defineFixtures } from './types';
import { STRESS } from './stress';

// The embed URL comes from admin settings (not read here), so every fixture shows the disabled state.
export const blendingBoardFixtures = defineFixtures<'blending-board'>({
  empty: { config: {} },
  typical: { config: {} },
  stress: { customTitle: STRESS.title, config: {} },
});

import { defineFixtures } from './types';
import { STRESS } from './stress';

// No active PDF in any fixture: loading one needs Drive or the network.
export const pdfFixtures = defineFixtures<'pdf'>({
  empty: { config: {} },
  typical: { config: { activePdfId: null, activePdfName: 'Unit 4 Review' } },
  stress: {
    customTitle: STRESS.title,
    config: { activePdfId: null, activePdfName: STRESS.title },
  },
});

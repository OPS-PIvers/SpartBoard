import { defineFixtures } from './types';
import { STRESS } from './stress';

// Queue entries live in the teacher's Drive, so the face stays on its empty queue.
export const nextUpFixtures = defineFixtures<'nextUp'>({
  empty: { config: {} },
  typical: {
    config: {
      sessionName: 'Help Queue',
      isActive: true,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      displayCount: 3,
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      sessionName: STRESS.title,
      isActive: true,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      displayCount: 10,
    },
  },
});

import type { TourSurfaceMap } from './types';

// The Guided Learning student app; its player controls sit on guidedLearning.player.
export const SURFACES: TourSurfaceMap = {
  'student-guided-learning.page': {
    label: 'Guided Learning student page (start, player, finished)',
    kind: 'page',
    url: '/guided-learning/{sessionId}',
    needs: ['live-session'],
    files: ['components/guidedLearning/'],
  },
};

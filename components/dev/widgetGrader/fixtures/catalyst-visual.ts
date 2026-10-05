import { defineFixtures } from './types';
import { STRESS } from './stress';

export const catalystVisualFixtures = defineFixtures<'catalyst-visual'>({
  empty: { config: { routineId: '', stepIndex: 0 } },
  typical: {
    config: {
      routineId: 'routine-1',
      stepIndex: 0,
      title: 'Give Me Five',
      icon: 'Hand',
      category: 'Get Attention',
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      routineId: 'routine-1',
      stepIndex: 0,
      title: `${STRESS.title} ${STRESS.word}`,
      icon: 'Users',
      category: 'Engage',
    },
  },
});

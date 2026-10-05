import { defineFixtures } from './types';
import { STRESS } from './stress';

export const onboardingFixtures = defineFixtures<'onboarding'>({
  empty: { config: { completedTasks: [] } },
  typical: { config: { completedTasks: ['add-widget', 'resize-widget'] } },
  stress: {
    customTitle: STRESS.title,
    config: {
      completedTasks: Array.from(
        { length: STRESS.itemCount },
        (_, i) => `task-${i}`
      ),
    },
  },
});

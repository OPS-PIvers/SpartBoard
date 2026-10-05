import { defineFixtures } from './types';

export const bloomsDetailFixtures = defineFixtures<'blooms-detail'>({
  empty: { config: { parentWidgetId: '', level: 'remember' } },
  typical: {
    config: {
      parentWidgetId: 'grader-parent',
      level: 'apply',
      category: 'actionVerbs',
    },
  },
  stress: {
    config: {
      parentWidgetId: 'grader-parent',
      level: 'evaluate',
      category: 'questionStems',
    },
  },
});

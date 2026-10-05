import type { BloomsCategoryKey } from '@/types';
import { defineFixtures } from './types';

const ALL: BloomsCategoryKey[] = [
  'questionStems',
  'actionVerbs',
  'activityTypes',
  'assessmentIdeas',
  'iCanStatements',
  'dokAlignment',
];

export const bloomsTaxonomyFixtures = defineFixtures<'blooms-taxonomy'>({
  empty: { config: {} },
  typical: { config: { enabledCategories: ALL.slice(0, 3) } },
  stress: {
    config: {
      enabledCategories: ALL,
      aiTopic:
        'Pneumonoultramicroscopicsilicovolcanoconiosis and the water cycle',
    },
  },
});

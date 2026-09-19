import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { BloomsTaxonomyConfig } from '@/types';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { BloomsCategoriesField } from './settingsFields';

const renderCategories = (ctx: CustomRenderCtx) =>
  React.createElement(BloomsCategoriesField, { ctx });

export default defineSettings<BloomsTaxonomyConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: adminScopedCategoryList
        {
          key: 'enabledCategories',
          type: 'custom',
          label: 'contentCategories',
          searchTerms: [
            'questionStems',
            'actionVerbs',
            'activityTypes',
            'assessmentIdeas',
            'iCanStatements',
            'dokAlignment',
          ],
          render: renderCategories,
        },
      ],
    },
  ],
});

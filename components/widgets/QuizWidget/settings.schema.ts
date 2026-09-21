import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { QuizConfig } from '@/types';
import { QuizManagementField } from './settingsFields';

const renderManagement = (ctx: CustomRenderCtx) =>
  React.createElement(QuizManagementField, { ctx });

export default defineSettings<QuizConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // Widget label lives on WidgetData, while the navigation buttons update
        // several config keys atomically, so this remains one contextual field.
        {
          key: 'view',
          type: 'custom',
          label: 'management',
          searchTerms: ['widgetLabel', 'assignmentArchive', 'managerView'],
          render: renderManagement,
        },
      ],
    },
  ],
});

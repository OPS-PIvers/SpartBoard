import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { GuidedLearningConfig } from '@/types';
import { GuidedLearningLibraryField } from './settingsFields';

const renderLibraryButton = (ctx: CustomRenderCtx) =>
  React.createElement(GuidedLearningLibraryField, { ctx });

export default defineSettings<GuidedLearningConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        // schema-gap: opens-the-widget-library-view
        {
          key: 'view',
          type: 'custom',
          label: 'goToLibrary',
          help: 'settingsHelp',
          render: renderLibraryButton,
        },
      ],
    },
  ],
});

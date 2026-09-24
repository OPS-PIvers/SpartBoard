import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { ProjectsConfig } from '@/types';
import { ProjectsLibraryField } from './settingsFields';

const renderLibrary = (ctx: CustomRenderCtx) =>
  React.createElement(ProjectsLibraryField, { ctx });

export default defineSettings<ProjectsConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        // schema-gap: rollout-gated link back to the widget's library view
        {
          key: 'view',
          type: 'custom',
          label: 'library',
          searchTerms: ['goToLibrary'],
          render: renderLibrary,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'cardColor',
          type: 'surfaceColor',
          label: 'groupRows',
          help: 'groupRowsHelp',
          opacityKey: 'cardOpacity',
        },
      ],
    },
  ],
  styleKeys: ['fontFamily'],
});

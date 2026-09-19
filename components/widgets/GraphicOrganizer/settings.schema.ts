import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { GraphicOrganizerConfig } from '@/types';
import { GraphicOrganizerTemplateField } from './settingsFields';

const renderTemplateType = (ctx: CustomRenderCtx) =>
  React.createElement(GraphicOrganizerTemplateField, { ctx });

export default defineSettings<GraphicOrganizerConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: buildingTemplateCatalog
        {
          key: 'templateType',
          type: 'custom',
          label: 'templateType',
          render: renderTemplateType,
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'cardColor'],
});

import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { CustomWidgetConfig } from '@/types';
import { CustomWidgetSettingsField } from './settingsFields';

const renderAdminSettings = (ctx: CustomRenderCtx) =>
  React.createElement(CustomWidgetSettingsField, { ctx });

export default defineSettings<CustomWidgetConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'adminSettings',
          type: 'custom',
          label: 'configuration',
          searchTerms: ['saveSettings', 'widgetId'],
          render: renderAdminSettings,
        },
      ],
    },
  ],
});

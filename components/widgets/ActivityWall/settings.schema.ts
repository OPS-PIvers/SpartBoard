import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { ActivityWallManagedField } from './settingsFields';

type ActivityWallSettingsConfig = { managedNotice?: string };

const renderManagedNotice = (ctx: CustomRenderCtx) =>
  React.createElement(ActivityWallManagedField, { ctx });

export default defineSettings<ActivityWallSettingsConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'managedNotice',
          type: 'custom',
          label: 'walls',
          render: renderManagedNotice,
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'cardColor'],
});

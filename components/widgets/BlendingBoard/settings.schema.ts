import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { BlendingBoardManagedField } from './settingsFields';

type BlendingBoardSettingsConfig = { managedNotice?: string };

const renderManagedNotice = (ctx: CustomRenderCtx) =>
  React.createElement(BlendingBoardManagedField, { ctx });

export default defineSettings<BlendingBoardSettingsConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'managedNotice',
          type: 'custom',
          label: 'centrallyManaged',
          render: renderManagedNotice,
        },
      ],
    },
  ],
});

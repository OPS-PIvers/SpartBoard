import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { CatalystManagedField } from './settingsFields';

type CatalystSettingsConfig = { managedNotice?: string };

const renderManagedNotice = (ctx: CustomRenderCtx) =>
  React.createElement(CatalystManagedField, { ctx });

export default defineSettings<CatalystSettingsConfig>({
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

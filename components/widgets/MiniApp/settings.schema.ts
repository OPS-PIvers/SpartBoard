import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { MiniAppManageNotice } from './settingsFields';

type MiniAppSettingsConfig = { manageNotice?: string };

const renderManageNotice = (ctx: CustomRenderCtx) =>
  React.createElement(MiniAppManageNotice, { ctx });

export default defineSettings<MiniAppSettingsConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'manageNotice',
          type: 'custom',
          label: 'apps',
          render: renderManageNotice,
        },
      ],
    },
  ],
});

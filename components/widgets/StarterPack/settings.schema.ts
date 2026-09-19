import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { StarterPackField } from './settingsFields';

type StarterPackSettingsSchemaConfig = {
  packName?: string;
};

const renderStarterPack = (ctx: CustomRenderCtx) =>
  React.createElement(StarterPackField, { ctx });

export default defineSettings<StarterPackSettingsSchemaConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: external-starter-pack-save-actions
        {
          key: 'packName',
          type: 'custom',
          label: 'packName',
          render: renderStarterPack,
        },
      ],
    },
  ],
});

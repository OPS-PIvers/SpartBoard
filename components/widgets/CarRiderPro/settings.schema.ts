import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { CarRiderProConfig } from '@/types';
import { CarRiderProManagedField } from './settingsFields';

const renderManagedNotice = (ctx: CustomRenderCtx) =>
  React.createElement(CarRiderProManagedField, { ctx });

export default defineSettings<CarRiderProConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'iframeUrl',
          type: 'custom',
          label: 'centrallyManaged',
          render: renderManagedNotice,
        },
      ],
    },
  ],
});

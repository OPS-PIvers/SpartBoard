import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { First5Config } from '@/types';
import { First5ManagedField } from './settingsFields';

const renderManagedNotice = (ctx: CustomRenderCtx) =>
  React.createElement(First5ManagedField, { ctx });

export default defineSettings<First5Config>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: '__brand',
          type: 'custom',
          label: 'automaticContent',
          render: renderManagedNotice,
        },
      ],
    },
  ],
});

import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { ExpectationsConfig } from '@/types';
import { ExpectationsSoundSyncField } from './settingsFields';

const renderSoundSync = (ctx: CustomRenderCtx) =>
  React.createElement(ExpectationsSoundSyncField, { ctx });

export default defineSettings<ExpectationsConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        // schema-gap: exclusivePartnerToggle
        {
          key: 'syncSoundWidget',
          type: 'custom',
          label: 'soundSync',
          searchTerms: ['autoAdjustSoundMeter'],
          render: renderSoundSync,
        },
      ],
    },
  ],
});

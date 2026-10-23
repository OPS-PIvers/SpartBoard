import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { ArtsLettersAgendaConfig } from '@/types';
import { AgendaVersionField } from './settingsFields';

const renderVersion = (ctx: CustomRenderCtx) =>
  React.createElement(AgendaVersionField, { ctx });

export default defineSettings<ArtsLettersAgendaConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'version',
          type: 'custom',
          label: 'version',
          searchTerms: ['simple', 'detailed'],
          visibleWhen: (ctx) =>
            ctx.canAccessFeature('agenda-versions') ||
            ctx.config.version === 'detailed',
          render: renderVersion,
        },
      ],
    },
  ],
  styleKeys: ['textSizePreset', 'fontFamily', 'fontColor', 'cardColor'],
});

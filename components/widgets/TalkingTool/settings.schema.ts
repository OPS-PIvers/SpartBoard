import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { TalkingToolManagedField } from './settingsFields';

type TalkingToolSettingsConfig = { managedNotice?: string };

const renderManagedNotice = (ctx: CustomRenderCtx) =>
  React.createElement(TalkingToolManagedField, { ctx });

export default defineSettings<TalkingToolSettingsConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'managedNotice',
          type: 'custom',
          label: 'globalContent',
          render: renderManagedNotice,
        },
      ],
    },
  ],
  // fontFamily/fontColor are never read by the face, so only the surface is offered.
  styleKeys: ['cardColor'],
});

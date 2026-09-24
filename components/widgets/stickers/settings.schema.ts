import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { StickerBookNoticeField } from './settingsFields';

type StickerBookSettingsConfig = { managedNotice?: string };

const renderNotice = (ctx: CustomRenderCtx) =>
  React.createElement(StickerBookNoticeField, { ctx });

// No styleKeys: the sticker book face reads none of the Typography or Surface keys.
export default defineSettings<StickerBookSettingsConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'managedNotice',
          type: 'custom',
          label: 'stickerBook',
          render: renderNotice,
        },
      ],
    },
  ],
});

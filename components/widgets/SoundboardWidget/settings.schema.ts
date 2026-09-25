import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { SoundboardConfig } from '@/types';
import { SoundboardSoundPickerField } from './settingsFields';

const renderSoundPicker = (ctx: CustomRenderCtx) =>
  React.createElement(SoundboardSoundPickerField, { ctx });

export default defineSettings<SoundboardConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: contextualMultiSelect
        {
          key: 'selectedSoundIds',
          type: 'custom',
          label: 'availableSounds',
          searchTerms: ['soundButtons'],
          render: renderSoundPicker,
        },
      ],
    },
  ],
});

import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomField } from '@/components/settings/schema/types';
import type { SoundboardConfig } from '@/types';
import { SoundboardSettings } from './SchemaControls';

// schema-gap: compositeControl — the available sound catalog depends on the user's building and admin configuration.
const renderSettings: CustomField<'selectedSoundIds'>['render'] = ({
  widget,
}) => React.createElement(SoundboardSettings, { widget });

export default defineSettings<SoundboardConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'selectedSoundIds',
          type: 'custom',
          label: 'soundSettings',
          render: renderSettings,
        },
      ],
    },
  ],
});

import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomField } from '@/components/settings/schema/types';
import type { SoundConfig } from '@/types';
import { SoundAppearanceSettings, SoundSettings } from './SchemaControls';

// schema-gap: compositeControl — preserves Nexus-aware controls whose availability depends on other board widgets.
const renderSettings: CustomField<'sensitivity'>['render'] = ({ widget }) =>
  React.createElement(SoundSettings, { widget });
const renderAppearance: CustomField<'visual'>['render'] = ({ widget }) =>
  React.createElement(SoundAppearanceSettings, { widget });

export default defineSettings<SoundConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'sensitivity',
          type: 'custom',
          label: 'soundSettings',
          render: renderSettings,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'visual',
          type: 'custom',
          label: 'appearance',
          render: renderAppearance,
        },
      ],
    },
  ],
});

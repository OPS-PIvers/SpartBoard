import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomField } from '@/components/settings/schema/types';
import type { DiceConfig } from '@/types';
import { DiceSettings } from './SchemaControls';

// schema-gap: compositeControl — preserves the coordinated dice-count and surface-color controls.
const renderSettings: CustomField<'count'>['render'] = ({ widget }) =>
  React.createElement(DiceSettings, { widget });

export default defineSettings<DiceConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'count',
          type: 'custom',
          label: 'diceSettings',
          render: renderSettings,
        },
      ],
    },
  ],
});

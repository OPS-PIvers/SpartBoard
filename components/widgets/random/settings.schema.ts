import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomField } from '@/components/settings/schema/types';
import type { RandomConfig } from '@/types';
import { RandomSettings } from './SchemaControls';

// schema-gap: compositeControl — preserves the widget-specific interactions while moving ownership to the drawer schema.
const renderSettings: CustomField<'mode'>['render'] = ({ widget }) =>
  React.createElement(RandomSettings, { widget });

export default defineSettings<RandomConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'mode',
          type: 'custom',
          label: 'randomizerSettings',
          render: renderSettings,
        },
      ],
    },
  ],
});

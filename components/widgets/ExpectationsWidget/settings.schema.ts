import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomField } from '@/components/settings/schema/types';
import type { ExpectationsConfig } from '@/types';
import { ExpectationsSettings } from './SchemaControls';

// schema-gap: compositeControl — preserves the widget-specific interactions while moving ownership to the drawer schema.
const renderSettings: CustomField<'syncSoundWidget'>['render'] = ({ widget }) =>
  React.createElement(ExpectationsSettings, { widget });

export default defineSettings<ExpectationsConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'syncSoundWidget',
          type: 'custom',
          label: 'nexusConnections',
          render: renderSettings,
        },
      ],
    },
  ],
});

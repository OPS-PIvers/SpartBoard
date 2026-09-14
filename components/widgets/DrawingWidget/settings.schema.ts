import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomField } from '@/components/settings/schema/types';
import type { DrawingConfig } from '@/types';
import { DrawingSettings } from './SchemaControls';

// schema-gap: compositeControl — background changes update both the active page and the default for new pages.
const renderSettings: CustomField<'background'>['render'] = ({ widget }) =>
  React.createElement(DrawingSettings, { widget });

export default defineSettings<DrawingConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'background',
          type: 'custom',
          label: 'drawingSettings',
          render: renderSettings,
        },
      ],
    },
  ],
});

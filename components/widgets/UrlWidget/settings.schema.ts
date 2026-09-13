import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomField } from '@/components/settings/schema/types';
import type { UrlWidgetConfig } from '@/types';
import { UrlWidgetSettings } from './SchemaControls';

// schema-gap: compositeControl — preserves the widget-specific interactions while moving ownership to the drawer schema.
const renderSettings: CustomField<'urls'>['render'] = ({ widget }) =>
  React.createElement(UrlWidgetSettings, { widget });

export default defineSettings<UrlWidgetConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'urls',
          type: 'custom',
          label: 'linkSettings',
          render: renderSettings,
        },
      ],
    },
  ],
});

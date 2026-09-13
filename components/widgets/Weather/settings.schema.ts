import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomField } from '@/components/settings/schema/types';
import type { WeatherConfig } from '@/types';
import { WeatherAppearanceSettings, WeatherSettings } from './SchemaControls';

// schema-gap: compositeControl — preserves the widget-specific interactions while moving ownership to the drawer schema.
const renderSettings: CustomField<'temp'>['render'] = ({ widget }) =>
  React.createElement(WeatherSettings, { widget });
const renderAppearance: CustomField<'fontFamily'>['render'] = ({ widget }) =>
  React.createElement(WeatherAppearanceSettings, { widget });

export default defineSettings<WeatherConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'temp',
          type: 'custom',
          label: 'weatherSettings',
          render: renderSettings,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'fontFamily',
          type: 'custom',
          label: 'appearance',
          render: renderAppearance,
        },
      ],
    },
  ],
});

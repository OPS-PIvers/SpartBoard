import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomField } from '@/components/settings/schema/types';
import type { ChecklistConfig } from '@/types';
import {
  ChecklistAppearanceSettings,
  ChecklistSettings,
} from './SchemaControls';

// schema-gap: compositeControl — preserves the widget-specific interactions while moving ownership to the drawer schema.
const renderSettings: CustomField<'items'>['render'] = ({ widget }) =>
  React.createElement(ChecklistSettings, { widget });
const renderAppearance: CustomField<'fontFamily'>['render'] = ({ widget }) =>
  React.createElement(ChecklistAppearanceSettings, { widget });

export default defineSettings<ChecklistConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'items',
          type: 'custom',
          label: 'taskSettings',
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

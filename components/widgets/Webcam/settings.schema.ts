import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomField } from '@/components/settings/schema/types';
import type { WebcamConfig } from '@/types';
import { WebcamSettings } from './SchemaControls';

// schema-gap: compositeControl — preserves the camera-to-Notes workflow as one contextual control.
const renderSettings: CustomField<'autoSendToNotes'>['render'] = ({ widget }) =>
  React.createElement(WebcamSettings, { widget });

export default defineSettings<WebcamConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'autoSendToNotes',
          type: 'custom',
          label: 'cameraSettings',
          render: renderSettings,
        },
      ],
    },
  ],
});

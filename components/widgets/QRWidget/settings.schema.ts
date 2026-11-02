import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { QRConfig } from '@/types';
import { QRDestinationField, QRTextSyncField } from './settingsFields';
import { hiddenWithConnections } from '@/components/settings/schema/hiddenWithConnections';

const renderDestination = (ctx: CustomRenderCtx) =>
  React.createElement(QRDestinationField, { ctx });
const renderTextSync = (ctx: CustomRenderCtx) =>
  React.createElement(QRTextSyncField, { ctx });

export default defineSettings<QRConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: boardAwareDerivedValue
        {
          key: 'url',
          type: 'custom',
          label: 'destinationUrl',
          render: renderDestination,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        // schema-gap: boardAwareWidgetSync
        {
          key: 'syncWithTextWidget',
          type: 'custom',
          label: 'linkRepeater',
          searchTerms: ['syncWithTextWidget'],
          render: renderTextSync,
          visibleWhen: hiddenWithConnections,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'showUrl',
          type: 'toggle',
          label: 'showUrl',
        },
      ],
    },
  ],
});

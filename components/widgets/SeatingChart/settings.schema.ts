import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { SeatingChartConfig } from '@/types';
import { SeatingChartActionsField } from './settingsFields';

const isCustomRoster = (ctx: FieldCtx) => ctx.config.rosterMode === 'custom';

const renderActions = (ctx: CustomRenderCtx) =>
  React.createElement(SeatingChartActionsField, { ctx });

export default defineSettings<SeatingChartConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'rosterMode',
          type: 'rosterPicker',
          label: 'rosterMode',
        },
        {
          key: 'names',
          type: 'textarea',
          label: 'customRoster',
          placeholder: 'customRosterPlaceholder',
          rows: 8,
          readValue: (ctx) => ctx.config.names ?? '',
          visibleWhen: isCustomRoster,
        },
        // schema-gap: seatingChartResetActions
        {
          key: 'furniture',
          type: 'custom',
          label: 'actions',
          searchTerms: ['clearAssignments', 'clearFurniture'],
          render: renderActions,
        },
      ],
    },
  ],
});

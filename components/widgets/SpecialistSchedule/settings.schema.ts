import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { SpecialistScheduleConfig } from '@/types';
import {
  SpecialistScheduleCycleDaysField,
  SpecialistScheduleRecurringItemsField,
} from './settingsFields';

const renderCycleDays = (ctx: CustomRenderCtx) =>
  React.createElement(SpecialistScheduleCycleDaysField, { ctx });
const renderRecurringItems = (ctx: CustomRenderCtx) =>
  React.createElement(SpecialistScheduleRecurringItemsField, { ctx });

export default defineSettings<SpecialistScheduleConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: buildingAwareRotationEditor
        {
          key: 'cycleDays',
          type: 'custom',
          label: 'cycleDays',
          render: renderCycleDays,
        },
        // schema-gap: recurringScheduleEditor
        {
          key: 'recurringItems',
          type: 'custom',
          label: 'recurringItems',
          render: renderRecurringItems,
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'textSizePreset', 'cardColor'],
});

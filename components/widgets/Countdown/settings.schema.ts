import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { CountdownConfig } from '@/types';
import { TEXT_COLOR_PRESETS } from '@/config/widgetAppearance';
import { CountdownDateField } from './settingsFields';

const renderStartDate = (ctx: CustomRenderCtx) =>
  React.createElement(CountdownDateField, { ctx, field: 'startDate' });

const renderEventDate = (ctx: CustomRenderCtx) =>
  React.createElement(CountdownDateField, { ctx, field: 'eventDate' });

const defaultBoolean =
  (key: 'includeWeekends' | 'countToday', fallback: boolean) =>
  (ctx: FieldCtx) =>
    ctx.config[key] ?? fallback;

export default defineSettings<CountdownConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'title',
          type: 'text',
          label: 'title',
          placeholder: 'titlePlaceholder',
        },
        {
          key: 'startDate',
          type: 'custom',
          label: 'startDate',
          render: renderStartDate,
        },
        {
          key: 'eventDate',
          type: 'custom',
          label: 'eventDate',
          render: renderEventDate,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        {
          key: 'includeWeekends',
          type: 'toggle',
          label: 'includeWeekends',
          readValue: defaultBoolean('includeWeekends', true),
        },
        {
          key: 'countToday',
          type: 'toggle',
          label: 'countToday',
          readValue: defaultBoolean('countToday', true),
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'viewMode',
          type: 'segmented',
          label: 'viewMode',
          readValue: (ctx) => ctx.config.viewMode ?? 'number',
          options: [
            { value: 'number', label: 'number' },
            { value: 'grid', label: 'grid' },
          ],
        },
        {
          key: 'eventColor',
          type: 'color',
          label: 'eventColor',
          readValue: (ctx) => ctx.config.eventColor ?? '#2d3f89',
          presets: TEXT_COLOR_PRESETS,
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'cardColor'],
});

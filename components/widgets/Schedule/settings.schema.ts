import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { ScheduleConfig } from '@/types';
import {
  ScheduleCalendarImportField,
  ScheduleListField,
} from './settingsFields';

const renderScheduleList = (ctx: CustomRenderCtx) =>
  React.createElement(ScheduleListField, { ctx });

const renderCalendarImport = (ctx: CustomRenderCtx) =>
  React.createElement(ScheduleCalendarImportField, { ctx });

const defaultBoolean =
  (
    key:
      | 'autoProgress'
      | 'autoScroll'
      | 'expandActiveItem'
      | 'isBuildingSyncEnabled',
    fallback: boolean
  ) =>
  (ctx: FieldCtx) =>
    ctx.config[key] ?? fallback;

export default defineSettings<ScheduleConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: scheduleEditor
        {
          key: 'schedules',
          type: 'custom',
          label: 'schedules',
          searchTerms: [
            'addSchedule',
            'addEvent',
            'todayOnly',
            'buildingSchedules',
            'copyToMySchedules',
          ],
          render: renderScheduleList,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        // Nexus: Calendar events can be imported into the selected schedule;
        // the partner card adds Calendar when it is absent from the board.
        {
          key: 'schedules',
          type: 'partnerWidget',
          label: 'calendarImport',
          section: 'connections',
          partner: 'calendar',
          control: {
            key: 'schedules',
            type: 'custom',
            label: 'calendarImport',
            render: renderCalendarImport,
          },
        },
        {
          key: 'autoProgress',
          type: 'toggle',
          label: 'autoProgress',
          readValue: defaultBoolean('autoProgress', false),
        },
        {
          key: 'autoScroll',
          type: 'toggle',
          label: 'autoScroll',
          readValue: defaultBoolean('autoScroll', false),
        },
        {
          key: 'expandActiveItem',
          type: 'toggle',
          label: 'expandActiveItem',
          readValue: defaultBoolean('expandActiveItem', true),
        },
        {
          key: 'isBuildingSyncEnabled',
          type: 'toggle',
          label: 'buildingSync',
          readValue: defaultBoolean('isBuildingSyncEnabled', true),
        },
      ],
    },
  ],
  styleKeys: ['textSizePreset', 'fontFamily', 'fontColor', 'cardColor'],
});

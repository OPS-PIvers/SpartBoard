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
          missingHelp: 'addCalendarTip',
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
          help: 'autoProgressHelp',
          readValue: defaultBoolean('autoProgress', false),
        },
        {
          key: 'autoScroll',
          type: 'toggle',
          label: 'autoScroll',
          help: 'autoScrollHelp',
          readValue: defaultBoolean('autoScroll', false),
        },
        {
          key: 'expandActiveItem',
          type: 'toggle',
          label: 'expandActiveItem',
          help: 'expandActiveItemHelp',
          readValue: defaultBoolean('expandActiveItem', true),
        },
        {
          key: 'isBuildingSyncEnabled',
          type: 'toggle',
          label: 'buildingSync',
          help: 'buildingSyncHelp',
          readValue: defaultBoolean('isBuildingSyncEnabled', true),
        },
      ],
    },
  ],
  styleKeys: ['textSizePreset', 'fontFamily', 'fontColor', 'cardColor'],
});

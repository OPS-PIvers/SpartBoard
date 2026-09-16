import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { CalendarConfig } from '@/types';
import {
  CalendarBuildingSyncField,
  CalendarPersonalCalendarsField,
} from './settingsFields';

const renderBuildingSync = (ctx: CustomRenderCtx) =>
  React.createElement(CalendarBuildingSyncField, { ctx });
const renderPersonalCalendars = (ctx: CustomRenderCtx) =>
  React.createElement(CalendarPersonalCalendarsField, { ctx });

export default defineSettings<CalendarConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'events',
          type: 'list',
          label: 'localEvents',
          addLabel: 'addEvent',
          row: {
            createRow: () => ({ title: '', date: '', time: '' }),
            fields: [
              {
                key: 'title',
                type: 'text',
                label: 'eventTitle',
                placeholder: 'eventTitlePlaceholder',
              },
              {
                key: 'date',
                type: 'text',
                label: 'eventDate',
                placeholder: 'eventDatePlaceholder',
              },
              {
                key: 'time',
                type: 'text',
                label: 'eventTime',
                placeholder: 'eventTimePlaceholder',
              },
            ],
          },
        },
        // schema-gap: oauthManagedIdList
        {
          key: 'personalCalendarIds',
          type: 'custom',
          label: 'personalCalendars',
          searchTerms: ['connectGoogle', 'calendarId'],
          render: renderPersonalCalendars,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        // schema-gap: contextualSyncStatus
        {
          key: 'isBuildingSyncEnabled',
          type: 'custom',
          label: 'buildingSchedule',
          searchTerms: ['syncBuildingSchedule'],
          render: renderBuildingSync,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'daysVisible',
          type: 'number',
          label: 'daysVisible',
          help: 'daysVisibleHelp',
          min: 1,
          max: 30,
          step: 1,
        },
      ],
    },
  ],
  styleKeys: [
    'textSizePreset',
    'fontFamily',
    'fontColor',
    'cardColor',
    'cardOpacity',
  ],
});

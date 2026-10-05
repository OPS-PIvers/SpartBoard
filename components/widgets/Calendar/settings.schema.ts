import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { CalendarConfig } from '@/types';
import {
  CalendarBuildingSyncField,
  CalendarPersonalCalendarsField,
} from './settingsFields';
import { DEFAULT_HEADER_COLOR } from './constants';

const dayView = (ctx: FieldCtx) => ctx.canAccessFeature('calendar-day-view');
const HEADER_COLOR_PRESETS = [
  { name: 'Brand blue', hex: DEFAULT_HEADER_COLOR },
  { name: 'Brand red', hex: '#ad2122' },
  { name: 'Slate', hex: '#334155' },
  { name: 'Green', hex: '#047857' },
  { name: 'Amber', hex: '#b45309' },
  { name: 'Sky', hex: '#0369a1' },
];

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
          min: 1,
          max: 30,
          step: 1,
        },
        {
          key: 'pastEvents',
          type: 'segmented',
          label: 'pastEvents',
          visibleWhen: dayView,
          readValue: (ctx) => ctx.config.pastEvents ?? 'hide',
          options: [
            { value: 'hide', label: 'pastHide' },
            { value: 'scroll', label: 'pastScroll' },
          ],
        },
        {
          key: 'headerColor',
          type: 'color',
          label: 'headerColor',
          visibleWhen: dayView,
          readValue: (ctx) => ctx.config.headerColor ?? DEFAULT_HEADER_COLOR,
          presets: HEADER_COLOR_PRESETS,
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

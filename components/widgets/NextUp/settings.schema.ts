import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { NextUpConfig } from '@/types';
import { NextUpSessionField, NextUpThemeField } from './settingsFields';

const renderSession = (ctx: CustomRenderCtx) =>
  React.createElement(NextUpSessionField, { ctx });
const renderTheme = (ctx: CustomRenderCtx) =>
  React.createElement(NextUpThemeField, { ctx });

export default defineSettings<NextUpConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: Drive-backed live-session lifecycle and roster import.
        {
          key: 'activeDriveFileId',
          type: 'custom',
          label: 'sessionStatus',
          searchTerms: [
            'newQueue',
            'loadExisting',
            'importActiveClass',
            'copyStudentLink',
            'endAndSave',
            'discard',
          ],
          render: renderSession,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        {
          key: 'autoStartTimer',
          type: 'partnerWidget',
          label: 'autoStartTimer',
          section: 'connections',
          partner: 'time-tool',
          control: {
            key: 'autoStartTimer',
            type: 'toggle',
            label: 'autoStartTimer',
          },
        },
        {
          key: 'displayCount',
          type: 'slider',
          label: 'displayCount',
          min: 1,
          max: 10,
          step: 1,
          readValue: (ctx) => ctx.config.displayCount ?? 3,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        // styling.themeColor is nested, which the top-level schema field kit
        // deliberately does not address directly.
        {
          key: 'styling',
          type: 'custom',
          label: 'visualStyle',
          render: renderTheme,
        },
      ],
    },
  ],
});

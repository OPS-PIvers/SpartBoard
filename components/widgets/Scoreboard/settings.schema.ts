import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { ScoreboardConfig } from '@/types';
import { ScoreboardSettings } from './settingsFields';

const renderTeams = (ctx: CustomRenderCtx) =>
  React.createElement(
    'div',
    {
      id: ctx.id,
      role: 'group',
      'aria-labelledby': ctx.labelId,
      'aria-describedby': ctx.describedBy,
    },
    React.createElement(ScoreboardSettings, {
      widget: ctx.widget,
      showLayout: false,
    })
  );

export default defineSettings<ScoreboardConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: crossWidgetTeamEditor
        {
          key: 'teams',
          type: 'custom',
          label: 'teams',
          searchTerms: ['importRandomizer', 'resetScores', 'addTeam'],
          render: renderTeams,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'layout',
          type: 'segmented',
          label: 'layout',
          options: [
            { value: 'cards', label: 'cards' },
            { value: 'rows', label: 'rows' },
          ],
        },
      ],
    },
  ],
});

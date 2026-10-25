import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { ScoreboardConfig } from '@/types';
import { ScoreboardSettings } from './settingsFields';
import { SCOREBOARD_POINT_PRESETS, scoreboardPointPresetId } from './points';

const pro = (ctx: FieldCtx) => ctx.canAccessFeature('scoreboard-pro');

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
        {
          key: 'sortByScore',
          type: 'toggle',
          label: 'sortByScore',
          readValue: (ctx) => ctx.config.sortByScore !== false,
          visibleWhen: (ctx) => pro(ctx) && ctx.config.layout === 'rows',
        },
        {
          key: 'pointValues',
          type: 'select',
          label: 'pointButtons',
          options: SCOREBOARD_POINT_PRESETS.map((preset) => ({
            value: preset.id,
            label: `pointPreset.${preset.id}`,
          })),
          readValue: (ctx) => scoreboardPointPresetId(ctx.config),
          toPatch: (value) => ({
            pointValues: [
              ...(SCOREBOARD_POINT_PRESETS.find((p) => p.id === value)
                ?.values ?? [1]),
            ],
          }),
          visibleWhen: pro,
        },
      ],
    },
  ],
});

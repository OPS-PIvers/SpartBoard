import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { RecessGearConfig } from '@/types';
import { RecessWeatherSourceField } from './settingsFields';

const defaultUseFeelsLike = (ctx: FieldCtx) => ctx.config.useFeelsLike ?? true;

const renderWeatherSource = (ctx: CustomRenderCtx) =>
  React.createElement(RecessWeatherSourceField, { ctx });

export default defineSettings<RecessGearConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        // Nexus: Recess Gear reads a Weather widget and offers a one-tap add
        // when no Weather widget is present on the board.
        {
          key: 'linkedWeatherWidgetId',
          type: 'partnerWidget',
          label: 'sourceWeatherWidget',
          section: 'connections',
          partner: 'weather',
          control: {
            key: 'linkedWeatherWidgetId',
            type: 'custom',
            label: 'sourceWeatherWidget',
            render: renderWeatherSource,
          },
        },
        {
          key: 'useFeelsLike',
          type: 'toggle',
          label: 'useFeelsLike',
          readValue: defaultUseFeelsLike,
        },
      ],
    },
  ],
});

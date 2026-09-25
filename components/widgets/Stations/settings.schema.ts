import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { StationsConfig } from '@/types';
import { StationsListField, StationsSendToRandomField } from './settingsFields';

const renderStations = (ctx: CustomRenderCtx) =>
  React.createElement(StationsListField, { ctx });

const renderSendToRandom = (ctx: CustomRenderCtx) =>
  React.createElement(StationsSendToRandomField, { ctx });

export default defineSettings<StationsConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        // schema-gap: stationEditorAndPresetLibrary
        {
          key: 'stations',
          type: 'custom',
          label: 'stations',
          searchTerms: [
            'addStation',
            'classGroups',
            'savedPresets',
            'useGroupNamesAsTitles',
          ],
          render: renderStations,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        // Nexus: this card supplies the one-tap Randomizer add action.
        {
          key: 'stations',
          type: 'partnerWidget',
          label: 'randomizer',
          section: 'connections',
          partner: 'random',
          control: {
            key: 'stations',
            type: 'custom',
            label: 'sendToRandom',
            render: renderSendToRandom,
          },
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor', 'cardColor'],
});

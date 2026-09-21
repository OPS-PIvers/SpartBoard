import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { MusicConfig } from '@/types';
import { STANDARD_COLORS, WIDGET_PALETTE } from '@/config/colors';
import { canUsePersonal } from './canUsePersonal';
import {
  MusicSourceField,
  MusicStationField,
  MusicSyncField,
} from './settingsFields';

const source = (ctx: FieldCtx) => ctx.config.source ?? 'curated';

const renderSource = (ctx: CustomRenderCtx) =>
  React.createElement(MusicSourceField, { ctx });
const renderStation = (ctx: CustomRenderCtx) =>
  React.createElement(MusicStationField, { ctx });
const renderSync = (ctx: CustomRenderCtx) =>
  React.createElement(MusicSyncField, { ctx });

export default defineSettings<MusicConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'source',
          type: 'custom',
          label: 'source',
          searchTerms: ['curatedStations', 'mySpotify'],
          visibleWhen: canUsePersonal,
          render: renderSource,
        },
        {
          key: 'layout',
          type: 'segmented',
          label: 'layout',
          options: [
            { value: 'default', label: 'layoutDefault' },
            { value: 'minimal', label: 'layoutMinimal' },
            { value: 'small', label: 'layoutSmall' },
          ],
          readValue: (ctx) => ctx.config.layout ?? 'default',
        },
        {
          key: 'stationId',
          type: 'custom',
          label: 'selectStation',
          visibleWhen: (ctx) =>
            source(ctx) === 'curated' || !canUsePersonal(ctx),
          render: renderStation,
        },
        {
          key: 'personalSpotifyUrl',
          type: 'custom',
          label: 'personalSpotify',
          visibleWhen: (ctx) =>
            canUsePersonal(ctx) && source(ctx) === 'personal',
          render: renderStation,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        {
          key: 'syncWithTimeTool',
          type: 'partnerWidget',
          label: 'syncWithTimeTool',
          section: 'connections',
          partner: 'time-tool',
          missingHelp: 'addTimeToolHelp',
          control: {
            key: 'syncWithTimeTool',
            type: 'custom',
            label: 'syncWithTimeTool',
            render: renderSync,
          },
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'bgColor',
          type: 'color',
          label: 'background',
          presets: [
            { name: 'White', hex: '#ffffff' },
            { name: 'Slate', hex: '#f8fafc' },
            { name: 'Dark', hex: '#1e293b' },
          ],
          allowTransparent: true,
        },
        {
          key: 'textColor',
          type: 'color',
          label: 'textColor',
          presets: [...WIDGET_PALETTE, '#ffffff'],
          readValue: (ctx) => ctx.config.textColor ?? STANDARD_COLORS.slate,
        },
      ],
    },
  ],
});

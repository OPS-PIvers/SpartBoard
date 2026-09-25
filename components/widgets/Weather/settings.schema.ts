import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import type { WeatherConfig } from '@/types';
import { WeatherAutoSyncField, WeatherFeelsLikeField } from './settingsFields';

const isAutomatic = (ctx: FieldCtx) => ctx.config.isAuto === true;
const isManual = (ctx: FieldCtx) => !isAutomatic(ctx);
const showClothing = (ctx: FieldCtx) => ctx.config.hideClothing !== true;
const renderFeelsLike = (ctx: CustomRenderCtx) =>
  React.createElement(WeatherFeelsLikeField, { ctx });
const renderAutoSync = (ctx: CustomRenderCtx) =>
  React.createElement(WeatherAutoSyncField, { ctx });

export default defineSettings<WeatherConfig>({
  groups: [
    {
      id: 'content',
      fields: [
        {
          key: 'isAuto',
          type: 'segmented',
          label: 'weatherMode',
          readValue: (ctx) => (isAutomatic(ctx) ? 'automatic' : 'manual'),
          toPatch: (value) => ({ isAuto: value === 'automatic' }),
          options: [
            { value: 'manual', label: 'manual' },
            { value: 'automatic', label: 'automatic' },
          ],
        },
        {
          key: 'temp',
          type: 'slider',
          label: 'temperature',
          min: 0,
          max: 110,
          step: 1,
          visibleWhen: isManual,
          toPatch: (value, ctx) => ({
            temp: value,
            locationName: ctx.t('widgets.weather.manualMode'),
          }),
        },
        {
          key: 'condition',
          type: 'segmented',
          label: 'condition',
          visibleWhen: isManual,
          options: [
            { value: 'sunny', label: 'sunny' },
            { value: 'cloudy', label: 'cloudy' },
            { value: 'rainy', label: 'rainy' },
            { value: 'snowy', label: 'snowy' },
            { value: 'windy', label: 'windy' },
          ],
        },
        // schema-gap: asyncWeatherSource
        {
          key: 'lastSync',
          type: 'custom',
          label: 'automaticWeather',
          searchTerms: [
            'weatherSource',
            'cityZip',
            'useLocation',
            'refreshWeather',
          ],
          visibleWhen: isAutomatic,
          render: renderAutoSync,
        },
      ],
    },
    {
      id: 'behavior',
      fields: [
        // schema-gap: inheritedToggle
        {
          key: 'showFeelsLike',
          type: 'custom',
          label: 'showFeelsLike',
          render: renderFeelsLike,
        },
        {
          key: 'hideClothing',
          type: 'toggle',
          label: 'hideClothing',
        },
        {
          key: 'syncBackground',
          type: 'toggle',
          label: 'syncBackground',
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'secondaryColor',
          type: 'accentColor',
          label: 'secondaryColor',
          // Marks the key as inherit-when-unset so validateSchema skips the missing-default warning.
          readValue: (ctx) => ctx.config.secondaryColor,
          fallback: (ctx) =>
            typeof ctx.config.fontColor === 'string'
              ? ctx.config.fontColor
              : '#334155',
          fallbackLabel: 'matchText',
        },
        {
          key: 'cardColor',
          type: 'surfaceColor',
          label: 'clothingCard',
          opacityKey: 'cardOpacity',
          visibleWhen: showClothing,
        },
      ],
    },
  ],
  styleKeys: ['fontFamily', 'fontColor'],
});

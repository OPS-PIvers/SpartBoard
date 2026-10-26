import React from 'react';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import type {
  CustomRenderCtx,
  FieldCtx,
} from '@/components/settings/schema/types';
import {
  WEATHER_DETAIL_FIELDS,
  type WeatherConfig,
  type WeatherDetailField,
} from '@/types';
import { WeatherAutoSyncField, WeatherFeelsLikeField } from './settingsFields';
import { weatherDetailsAllowed } from './useWeatherDetailsAllowed';

const isAutomatic = (ctx: FieldCtx) => ctx.config.isAuto === true;
const isManual = (ctx: FieldCtx) => !isAutomatic(ctx);
const showClothing = (ctx: FieldCtx) => ctx.config.hideClothing !== true;
const renderFeelsLike = (ctx: CustomRenderCtx) =>
  React.createElement(WeatherFeelsLikeField, { ctx });
const detailsVisible = (ctx: FieldCtx) =>
  weatherDetailsAllowed({
    canAccessFeature: ctx.canAccessFeature,
    adminConfig: ctx.adminConfig,
    selectedBuildings: ctx.selectedBuildings,
  });
const enabledDetails = (ctx: FieldCtx): WeatherDetailField[] =>
  Array.isArray(ctx.config.detailFields)
    ? (ctx.config.detailFields as WeatherDetailField[])
    : [];
// One toggle per reading; detailFields keeps the canonical order.
const detailToggle = (field: WeatherDetailField) => ({
  key: `detail_${field}` as const,
  type: 'toggle' as const,
  label: `detail_${field}`,
  section: 'weatherDetails',
  visibleWhen: detailsVisible,
  readValue: (ctx: FieldCtx) => enabledDetails(ctx).includes(field),
  toPatch: (value: unknown, ctx: FieldCtx) => {
    const next = new Set(enabledDetails(ctx));
    if (value === true) next.add(field);
    else next.delete(field);
    return {
      detailFields: WEATHER_DETAIL_FIELDS.filter((f) => next.has(f)),
    };
  },
});
const renderAutoSync = (ctx: CustomRenderCtx) =>
  React.createElement(WeatherAutoSyncField, { ctx });

// Detail toggles are virtual keys that read and write detailFields.
type WeatherSettingsKeys = WeatherConfig &
  Record<`detail_${WeatherDetailField}`, boolean>;

export default defineSettings<WeatherSettingsKeys>({
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
          // Details already replace the recess gear card.
          visibleWhen: (ctx) =>
            !(detailsVisible(ctx) && enabledDetails(ctx).length > 0),
        },
        {
          key: 'syncBackground',
          type: 'toggle',
          label: 'syncBackground',
        },
        ...WEATHER_DETAIL_FIELDS.map(detailToggle),
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

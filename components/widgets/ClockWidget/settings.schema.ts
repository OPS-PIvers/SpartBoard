import React from 'react';
import type { ClockConfig } from '@/types';
import { STANDARD_COLORS, WIDGET_PALETTE } from '@/config/colors';
import { TEXT_COLOR_SWATCHES } from '@/config/widgetAppearance';
import { ColorPresetPicker } from '@/components/common/ColorPresetPicker';
import { defineSettings } from '@/components/settings/schema/defineSettings';
import { resolveLabel } from '@/components/settings/renderer/resolveLabel';
import type {
  CustomRenderCtx,
  FieldCtx,
  UpdateConfig,
} from '@/components/settings/schema/types';

// schema-gap: accentColorNullable — "Match Time" clears to undefined and must preview the live themeColor.
const ClockDateColorField: React.FC<{
  ctx: FieldCtx;
  updateConfig: UpdateConfig;
  id: string;
  labelId: string;
  describedBy?: string;
}> = ({ ctx, updateConfig, id, labelId, describedBy }) => {
  const dateColor =
    typeof ctx.config.dateColor === 'string' ? ctx.config.dateColor : undefined;
  const themeColor =
    typeof ctx.config.themeColor === 'string'
      ? ctx.config.themeColor
      : STANDARD_COLORS.slate;
  return React.createElement(
    'div',
    { id, 'aria-labelledby': labelId, 'aria-describedby': describedBy },
    React.createElement(ColorPresetPicker, {
      hideLabel: true,
      labelId,
      label: resolveLabel(ctx.t, 'clock', 'dateColor'),
      presets: TEXT_COLOR_SWATCHES,
      value: dateColor,
      fallback: themeColor,
      onChange: (color: string) => updateConfig({ dateColor: color }),
      onClear: () => updateConfig({ dateColor: undefined }),
      clearLabel: resolveLabel(ctx.t, 'clock', 'matchTime'),
    })
  );
};

const renderDateColorField = (ctx: CustomRenderCtx): React.ReactNode => {
  const { updateConfig, id, labelId, describedBy, ...rest } = ctx;
  return React.createElement(ClockDateColorField, {
    ctx: rest,
    updateConfig,
    id,
    labelId,
    describedBy,
  });
};

export default defineSettings<ClockConfig>({
  groups: [
    {
      id: 'behavior',
      fields: [
        {
          key: 'format24',
          type: 'toggle',
          label: 'format24',
        },
        {
          key: 'showSeconds',
          type: 'toggle',
          label: 'showSeconds',
          disabledWhen: (ctx) => ctx.config.showTime === false,
        },
        {
          key: 'showTime',
          type: 'toggle',
          label: 'showTime',
          readValue: (ctx) => ctx.config.showTime !== false,
          // The last one on stays on so the clock is never blank.
          disabledWhen: (ctx) =>
            ctx.config.showTime !== false && ctx.config.showDate === false,
        },
        {
          key: 'showDate',
          type: 'toggle',
          label: 'showDate',
          readValue: (ctx) => ctx.config.showDate !== false,
          disabledWhen: (ctx) =>
            ctx.config.showDate !== false && ctx.config.showTime === false,
        },
      ],
    },
    {
      id: 'display',
      fields: [
        {
          key: 'clockStyle',
          type: 'segmented',
          label: 'clockStyle',
          options: [
            { value: 'modern', label: 'styles.modern' },
            { value: 'lcd', label: 'styles.lcd' },
            { value: 'minimal', label: 'styles.minimal' },
          ],
        },
        { key: 'glow', type: 'toggle', label: 'glow' },
        {
          key: 'themeColor',
          type: 'color',
          label: 'themeColor',
          presets: WIDGET_PALETTE,
        },
        {
          key: 'dateColor',
          type: 'custom',
          label: 'dateColor',
          render: renderDateColorField,
        },
      ],
    },
  ],
  styleKeys: ['fontFamily'],
});

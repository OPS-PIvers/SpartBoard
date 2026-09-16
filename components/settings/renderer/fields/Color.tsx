import React from 'react';
import type { ColorField } from '@/components/settings/schema/types';
import type { FieldProps } from '../FieldProps';
import { ColorPresetPicker } from '@/components/common/ColorPresetPicker';
import {
  FONT_COLOR_PRESETS,
  TEXT_COLOR_SWATCHES,
  NOTE_COLOR_PRESETS,
  ColorPreset,
} from '@/config/widgetAppearance';
import { resolveLabel } from '../resolveLabel';

const TRANSPARENT = 'transparent';

// Thin wrapper over the shared generic color picker; presets/allowTransparent come from the field.
export const Color: React.FC<FieldProps<ColorField<string>>> = ({
  field,
  value,
  onChange,
  id,
  describedBy,
  labelId,
  disabled,
  ctx,
}) => {
  const label = resolveLabel(ctx.t, ctx.widget.type, field.label);
  const presets: readonly ColorPreset[] =
    field.presets && field.presets.length > 0
      ? field.presets.map((preset) =>
          typeof preset === 'string' ? { name: preset, hex: preset } : preset
        )
      : ctx.surface !== 'drawer'
        ? TEXT_COLOR_SWATCHES
        : field.key === 'bgColor'
          ? NOTE_COLOR_PRESETS
          : FONT_COLOR_PRESETS;
  const current = typeof value === 'string' ? value : undefined;
  const isTransparent = current === TRANSPARENT;
  const fallback = presets[0]?.hex ?? '#000000';

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
    >
      <fieldset disabled={disabled} className="contents">
        <ColorPresetPicker
          hideLabel
          label={label}
          presets={presets}
          value={isTransparent ? undefined : current}
          fallback={fallback}
          onChange={(hex) => onChange(hex)}
          onClear={
            field.allowTransparent ? () => onChange(TRANSPARENT) : undefined
          }
          clearLabel="Transparent"
        />
      </fieldset>
    </div>
  );
};

import React from 'react';
import type { TextSizePresetField } from '@/components/settings/schema/types';
import type { FieldProps } from '../FieldProps';
import { TextSizePresetSettings } from '@/components/common/TextSizePresetSettings';
import { StepSlider } from '@/components/common/StepSlider';
import { TEXT_SIZE_PRESETS, presetFromScale } from '@/config/widgetAppearance';
import type { TextSizePreset as TextSizePresetValue } from '@/types';

type TextSizePresetShimConfig = {
  textSizePreset?: TextSizePresetValue;
  scaleMultiplier?: number;
};

// Thin wrapper over the shared text-size preset selector.
export const TextSizePreset: React.FC<
  FieldProps<TextSizePresetField<string>>
> = ({ value, onChange, id, describedBy, labelId, disabled, ctx }) => {
  const rawScale = ctx.config.scaleMultiplier;
  const shimConfig: TextSizePresetShimConfig = {
    textSizePreset:
      typeof value === 'string' ? (value as TextSizePresetValue) : undefined,
    // Forwards legacy scaleMultiplier so TextSizePresetSettings' own fallback can derive a preset.
    scaleMultiplier: typeof rawScale === 'number' ? rawScale : undefined,
  };
  const updateConfigShim = (patch: Partial<TextSizePresetShimConfig>) => {
    onChange(patch.textSizePreset);
  };

  if (ctx.surface === 'drawer') {
    return (
      <div id={id}>
        <StepSlider
          steps={TEXT_SIZE_PRESETS.map((p) => ({
            value: p.id,
            label: p.label,
          }))}
          value={
            shimConfig.textSizePreset ??
            presetFromScale(shimConfig.scaleMultiplier ?? 1)
          }
          onChange={(preset) => onChange(preset)}
          labelId={labelId}
          describedBy={describedBy}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div id={id}>
      <fieldset disabled={disabled} className="contents">
        <TextSizePresetSettings
          config={shimConfig}
          updateConfig={updateConfigShim}
          hideLabel
          labelId={labelId}
          describedBy={describedBy}
        />
      </fieldset>
    </div>
  );
};

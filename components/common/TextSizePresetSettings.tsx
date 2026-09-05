import React, { useId } from 'react';
import { Type } from 'lucide-react';
import { SettingsLabel } from './SettingsLabel';
import { handleRadioGroupKeyDown } from './radioGroupKeyNav';
import { TEXT_SIZE_PRESETS, presetFromScale } from '@/config/widgetAppearance';
import type { TextSizePreset } from '@/types';

interface PresetConfig {
  textSizePreset?: TextSizePreset;
  scaleMultiplier?: number;
}

interface TextSizePresetSettingsProps {
  config: PresetConfig;
  updateConfig: (updates: Partial<PresetConfig>) => void;
  fallbackScale?: number;
  writeScaleMultiplier?: boolean;
}

export const TextSizePresetSettings: React.FC<TextSizePresetSettingsProps> = ({
  config,
  updateConfig,
  fallbackScale = 1,
  writeScaleMultiplier = false,
}) => {
  const textSizeLabelId = useId();

  const presetCandidate = config.textSizePreset;
  const scaleCandidate = config.scaleMultiplier;

  const selectedPreset: TextSizePreset =
    presetCandidate ??
    presetFromScale(
      typeof scaleCandidate === 'number' ? scaleCandidate : fallbackScale
    );

  const selectPreset = (preset: (typeof TEXT_SIZE_PRESETS)[number]) =>
    updateConfig({
      textSizePreset: preset.id,
      ...(writeScaleMultiplier ? { scaleMultiplier: preset.multiplier } : {}),
    });

  return (
    <div>
      <SettingsLabel icon={Type} as="span" id={textSizeLabelId}>
        Text Size
      </SettingsLabel>
      <div
        className="grid grid-cols-2 gap-2"
        role="radiogroup"
        aria-labelledby={textSizeLabelId}
        onKeyDown={(e) =>
          handleRadioGroupKeyDown(e, TEXT_SIZE_PRESETS, selectPreset)
        }
      >
        {TEXT_SIZE_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            role="radio"
            aria-checked={selectedPreset === preset.id}
            tabIndex={selectedPreset === preset.id ? 0 : -1}
            onClick={() => selectPreset(preset)}
            className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide ${
              selectedPreset === preset.id
                ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-dark'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
};

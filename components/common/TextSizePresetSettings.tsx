import React from 'react';
import { Type } from 'lucide-react';
import { SettingsLabel } from './SettingsLabel';
import { TEXT_SIZE_PRESETS } from '@/config/widgetAppearance';
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

const scaleToPreset = (scale: number): TextSizePreset => {
  if (scale <= 0.92) return 'small';
  if (scale >= 1.32) return 'x-large';
  if (scale >= 1.1) return 'large';
  return 'medium';
};

export const TextSizePresetSettings: React.FC<TextSizePresetSettingsProps> = ({
  config,
  updateConfig,
  fallbackScale = 1,
  writeScaleMultiplier = false,
}) => {
  const presetCandidate = config.textSizePreset;
  const scaleCandidate = config.scaleMultiplier;

  const selectedPreset: TextSizePreset =
    presetCandidate ??
    (typeof scaleCandidate === 'number'
      ? scaleToPreset(scaleCandidate)
      : fallbackScale !== 1
        ? scaleToPreset(fallbackScale)
        : 'medium');

  return (
    <div>
      <SettingsLabel icon={Type}>Text Size</SettingsLabel>
      <div className="grid grid-cols-2 gap-2">
        {TEXT_SIZE_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            onClick={() =>
              updateConfig({
                textSizePreset: preset.id,
                ...(writeScaleMultiplier
                  ? { scaleMultiplier: preset.multiplier }
                  : {}),
              })
            }
            className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide ${
              selectedPreset === preset.id
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
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

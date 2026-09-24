import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DevicePreset } from '../../types/stage';
import {
  CUSTOM_SIZE_LIMITS,
  DEFAULT_CUSTOM_SIZE,
  DEVICE_PRESETS,
  clampCustomSize,
  customPreset,
} from './devicePresets';

interface DevicePresetPickerProps {
  preset: DevicePreset;
  onChange: (next: DevicePreset) => void;
  /** Hides the visible label on narrow headers; the select keeps its name. */
  compact?: boolean;
}

// Commits on blur or Enter so a partly typed size is never clamped mid-keystroke.
const SizeField: React.FC<{
  label: string;
  value: number;
  onCommit: (next: number) => void;
}> = ({ label, value, onCommit }) => {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const next = clampCustomSize(Number(draft));
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <input
      type="number"
      aria-label={label}
      value={draft}
      min={CUSTOM_SIZE_LIMITS.min}
      max={CUSTOM_SIZE_LIMITS.max}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-700"
    />
  );
};

/** Chooses which real surface the canvas is sized as. */
export const DevicePresetPicker: React.FC<DevicePresetPickerProps> = ({
  preset,
  onChange,
  compact = false,
}) => {
  const { t } = useTranslation();
  const options: DevicePreset['id'][] = [
    ...DEVICE_PRESETS.map((p) => p.id),
    'custom',
  ];
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
        <span className={compact ? 'sr-only' : 'max-[1439px]:sr-only'}>
          {t('glStudio.previewSize')}
        </span>
        <select
          value={preset.id}
          onChange={(e) => {
            const id = e.target.value as DevicePreset['id'];
            onChange(
              id === 'custom'
                ? customPreset(DEFAULT_CUSTOM_SIZE.w, DEFAULT_CUSTOM_SIZE.h)
                : (DEVICE_PRESETS.find((p) => p.id === id) ?? DEVICE_PRESETS[0])
            );
          }}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        >
          {options.map((id) => (
            <option key={id} value={id}>
              {t(`glStudio.devices.${id}`)}
            </option>
          ))}
        </select>
      </label>
      {preset.id === 'custom' && (
        <>
          <SizeField
            key={`w-${preset.w}`}
            label={t('glStudio.width')}
            value={preset.w}
            onCommit={(w) => onChange(customPreset(w, preset.h))}
          />
          <span className="text-xs text-slate-400" aria-hidden="true">
            ×
          </span>
          <SizeField
            key={`h-${preset.h}`}
            label={t('glStudio.height')}
            value={preset.h}
            onCommit={(h) => onChange(customPreset(preset.w, h))}
          />
        </>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { isCustomBackground } from '@/utils/backgrounds';
import { logError } from '@/utils/logError';

interface BackgroundsCustomColorPickerProps {
  activeBackground?: string;
}

export const BackgroundsCustomColorPicker: React.FC<
  BackgroundsCustomColorPickerProps
> = ({ activeBackground }) => {
  const { t } = useTranslation();
  const { setBackground } = useDashboard();
  const { recordRecentBackground } = useAuth();
  const [customColor, setCustomColor] = useState('#3b82f6');

  const applyCustomColor = () => {
    const id = `custom:${customColor}`;
    setBackground(id);
    recordRecentBackground(id).catch((err) => {
      logError('BackgroundsCustomColorPicker.apply.recordRecent', err);
    });
  };

  // Read current dashboard background — if it's a custom color, sync the picker
  const activeCustomValue =
    activeBackground && isCustomBackground(activeBackground)
      ? activeBackground.slice('custom:'.length)
      : '';
  const [prev, setPrev] = useState(activeCustomValue);
  if (activeCustomValue !== prev) {
    setPrev(activeCustomValue);
    if (activeCustomValue.startsWith('#')) {
      // <input type="color"> requires 6-digit hex; expand 3-digit shorthand (#abc → #aabbcc)
      const normalized =
        activeCustomValue.length === 4
          ? `#${activeCustomValue
              .slice(1)
              .split('')
              .map((c) => c + c)
              .join('')}`
          : activeCustomValue;
      setCustomColor(normalized);
    }
  }

  const isActive =
    activeCustomValue.startsWith('#') && activeCustomValue === customColor;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-slate-200 bg-white">
      <span className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
        {t('backgrounds.customColor', { defaultValue: 'Custom Color' })}
      </span>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          className="w-10 h-10 rounded-md border border-slate-200 bg-white cursor-pointer"
        />
        <span className="font-mono text-xs text-slate-500">{customColor}</span>
        <button
          type="button"
          onClick={applyCustomColor}
          disabled={isActive}
          className="ml-auto px-3 py-1.5 text-xxs font-bold uppercase tracking-wider bg-brand-blue-primary text-white rounded-md hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isActive
            ? t('backgrounds.applied', { defaultValue: 'Applied' })
            : t('backgrounds.apply', { defaultValue: 'Apply' })}
        </button>
      </div>
    </div>
  );
};

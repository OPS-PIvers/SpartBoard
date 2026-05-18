import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logError } from '@/utils/logError';
import {
  ArrowRight,
  ArrowDownRight,
  ArrowDown,
  ArrowDownLeft,
} from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { isCustomBackground } from '@/utils/backgrounds';

const GRADIENT_DIRECTIONS = [
  { angle: '90deg', labelKey: 'backgrounds.directionRight', icon: ArrowRight },
  {
    angle: '135deg',
    labelKey: 'backgrounds.directionDownRight',
    icon: ArrowDownRight,
  },
  { angle: '180deg', labelKey: 'backgrounds.directionDown', icon: ArrowDown },
  {
    angle: '225deg',
    labelKey: 'backgrounds.directionDownLeft',
    icon: ArrowDownLeft,
  },
] as const;

interface BackgroundsCustomGradientPickerProps {
  activeBackground?: string;
}

export const BackgroundsCustomGradientPicker: React.FC<
  BackgroundsCustomGradientPickerProps
> = ({ activeBackground }) => {
  const { t } = useTranslation();
  const { setBackground } = useDashboard();
  const [color1, setColor1] = useState('#3b82f6');
  const [color2, setColor2] = useState('#8b5cf6');
  const [angle, setAngle] = useState('135deg');

  // Sync from active custom gradient
  const activeCustomValue =
    activeBackground && isCustomBackground(activeBackground)
      ? activeBackground.slice('custom:'.length)
      : '';
  const [prev, setPrev] = useState(activeCustomValue);
  if (activeCustomValue !== prev) {
    setPrev(activeCustomValue);
    const m = activeCustomValue.match(
      /^linear-gradient\(\s*([^,]+?)\s*,\s*(#[0-9a-fA-F]{3,8})\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)$/
    );
    if (m?.[1] && m[2] && m[3]) {
      setAngle(m[1].trim());
      setColor1(m[2]);
      setColor2(m[3]);
    } else if (activeCustomValue.startsWith('linear-gradient(')) {
      logError(
        'BackgroundsCustomGradientPicker.sync',
        new Error('Could not parse saved gradient'),
        { value: activeCustomValue }
      );
    }
  }

  const gradientValue = `linear-gradient(${angle}, ${color1}, ${color2})`;
  const isActive = activeCustomValue === gradientValue;

  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg border border-slate-200 bg-white">
      <span className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
        {t('backgrounds.customGradient', { defaultValue: 'Custom Gradient' })}
      </span>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xxs font-bold text-slate-500">
            {t('backgrounds.gradientStart', { defaultValue: 'Start' })}
          </span>
          <input
            type="color"
            value={color1}
            onChange={(e) => setColor1(e.target.value)}
            className="w-full h-10 rounded-md border border-slate-200 bg-white cursor-pointer"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xxs font-bold text-slate-500">
            {t('backgrounds.gradientEnd', { defaultValue: 'End' })}
          </span>
          <input
            type="color"
            value={color2}
            onChange={(e) => setColor2(e.target.value)}
            className="w-full h-10 rounded-md border border-slate-200 bg-white cursor-pointer"
          />
        </label>
      </div>

      <div className="flex items-center gap-1">
        {GRADIENT_DIRECTIONS.map((d) => {
          const Icon = d.icon;
          const active = angle === d.angle;
          return (
            <button
              key={d.angle}
              type="button"
              onClick={() => setAngle(d.angle)}
              aria-label={t(d.labelKey)}
              className={`flex-1 p-2 rounded-md transition-colors ${
                active
                  ? 'bg-brand-blue-primary text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <Icon size={14} className="mx-auto" />
            </button>
          );
        })}
      </div>

      <div
        className="h-10 rounded-md border border-slate-200"
        style={{ background: gradientValue }}
      />

      <button
        type="button"
        onClick={() => setBackground(`custom:${gradientValue}`)}
        disabled={isActive}
        className="px-3 py-1.5 text-xxs font-bold uppercase tracking-wider bg-brand-blue-primary text-white rounded-md hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isActive
          ? t('backgrounds.applied', { defaultValue: 'Applied' })
          : t('backgrounds.apply', { defaultValue: 'Apply' })}
      </button>
    </div>
  );
};

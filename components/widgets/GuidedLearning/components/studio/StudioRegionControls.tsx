import React from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { GuidedLearningStep } from '@/types';
import {
  clearCalloutPin,
  convertShape,
  setCorner,
  type StudioShape,
} from './regionEdits';

interface StudioRegionControlsProps {
  step: GuidedLearningStep;
  onChange: (step: GuidedLearningStep) => void;
}

const SHAPES: readonly StudioShape[] = ['point', 'rect', 'ellipse', 'polygon'];

/** Target shape, rect corner radius and callout placement for the selected step. */
export const StudioRegionControls: React.FC<StudioRegionControlsProps> = ({
  step,
  onChange,
}) => {
  const { t } = useTranslation();
  const current: StudioShape = step.region?.shape ?? 'point';
  return (
    <div
      className="flex flex-col gap-4 border-b border-slate-200 p-4"
      data-testid="gl-studio-region-controls"
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-bold text-slate-600">
          {t('glStudio.targetShape')}
        </legend>
        <div className="grid grid-cols-4 gap-1">
          {SHAPES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={current === s}
              onClick={() => onChange(convertShape(step, s))}
              className={`rounded-md border px-2 py-1.5 text-xs font-bold transition-colors ${
                current === s
                  ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              {t(`glStudio.shape_${s}`)}
            </button>
          ))}
        </div>
      </fieldset>
      {step.region?.shape === 'rect' && (
        <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
          <span className="flex justify-between">
            {t('glStudio.cornerRadius')}
            <span className="tabular-nums text-slate-500">
              {Math.round(step.region.cornerPct ?? 0)}%
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={step.region.cornerPct ?? 0}
            onChange={(e) => onChange(setCorner(step, Number(e.target.value)))}
            className="accent-brand-blue-primary"
          />
        </label>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-600">
          {t('glStudio.calloutPosition')}
          <span className="ml-1.5 font-normal text-slate-500">
            {step.calloutPin
              ? t('glStudio.calloutPinned')
              : t('glStudio.calloutAuto')}
          </span>
        </span>
        {step.calloutPin && (
          <button
            type="button"
            onClick={() => onChange(clearCalloutPin(step))}
            className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600 hover:border-slate-400"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            {t('glStudio.resetCallout')}
          </button>
        )}
      </div>
    </div>
  );
};

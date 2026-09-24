import React from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { GuidedLearningStep } from '@/types';
import {
  convertShape,
  resetCalloutPlacement,
  setCorner,
  type StudioShape,
} from './regionEdits';
import {
  ChoiceGroup,
  fieldLabelClass,
  hintClass,
  quietButtonClass,
} from './panelControls';

interface StudioRegionControlsProps {
  step: GuidedLearningStep;
  /** `field` names a continuous edit so it coalesces; false makes its own undo entry. */
  onChange: (step: GuidedLearningStep, field?: string | false) => void;
}

const SHAPES: readonly StudioShape[] = ['point', 'rect', 'ellipse', 'polygon'];
const LEGACY_SIDES = ['above', 'below', 'left', 'right'] as const;

/** Target shape, rect corner radius and callout placement for the selected step. */
export const StudioRegionControls: React.FC<StudioRegionControlsProps> = ({
  step,
  onChange,
}) => {
  const { t } = useTranslation();
  const current: StudioShape = step.region?.shape ?? 'point';
  const legacySide = LEGACY_SIDES.find((s) => s === step.tooltipPosition);
  const legacy = !!legacySide || step.tooltipOffset !== undefined;
  const placement = step.calloutPin
    ? t('glStudio.calloutPinned')
    : legacySide
      ? t('glStudio.calloutPrefers', {
          side: t(`glStudio.calloutSide_${legacySide}`),
        })
      : t('glStudio.calloutAuto');
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="gl-studio-region-controls"
    >
      <ChoiceGroup
        legend={t('glStudio.targetShape')}
        value={current}
        options={SHAPES.map((s) => ({
          value: s,
          label: t(`glStudio.shape_${s}`),
        }))}
        onChange={(s) => onChange(convertShape(step, s), false)}
      />
      {step.region?.shape === 'rect' && (
        <label className={`flex flex-col gap-1.5 ${fieldLabelClass}`}>
          <span className="flex justify-between">
            {t('glStudio.cornerRadius')}
            <span className="font-normal tabular-nums text-slate-600">
              {Math.round(step.region.cornerPct ?? 0)}%
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={step.region.cornerPct ?? 0}
            onChange={(e) =>
              onChange(setCorner(step, Number(e.target.value)), 'corner')
            }
            className="accent-brand-blue-primary"
          />
        </label>
      )}
      <div
        className="flex flex-col gap-1.5"
        data-testid="gl-studio-callout-placement"
      >
        <span className={fieldLabelClass}>{t('glStudio.calloutPosition')}</span>
        <p className="text-sm text-slate-800">{placement}</p>
        <p className={hintClass}>{t('glStudio.calloutDragHint')}</p>
        {(!!step.calloutPin || legacy) && (
          <button
            type="button"
            onClick={() => onChange(resetCalloutPlacement(step), false)}
            className={quietButtonClass}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            {t('glStudio.resetCallout')}
          </button>
        )}
      </div>
    </div>
  );
};

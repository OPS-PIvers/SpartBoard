import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  LocateFixed,
  MessageSquare,
  MessageSquareShare,
  Pencil,
  Scaling,
  Trash2,
} from 'lucide-react';
import type { GuidedLearningStep } from '@/types';
import { CALLOUT_TONES, CALLOUT_TONE_STYLES } from '../../utils/calloutStyle';
import {
  clearCalloutPin,
  clearCalloutSize,
  setCalloutTone,
} from './regionEdits';
import { isTooltipCallout, toggleCalloutKind } from './calloutHandles';

interface CalloutToolbarProps {
  step: GuidedLearningStep;
  onChange: (step: GuidedLearningStep) => void;
  onEdit: () => void;
  onDelete: () => void;
}

const buttonClass =
  'flex h-8 w-8 items-center justify-center rounded-md text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:pointer-events-none disabled:opacity-40';

/** Floating pill over a selected callout: edit, resets, kind, colour and delete. */
export const CalloutToolbar: React.FC<CalloutToolbarProps> = ({
  step,
  onChange,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation();
  const tooltip = isTooltipCallout(step);
  const tone = step.calloutTone ?? 'dark';
  const sized =
    !!step.calloutBox ||
    step.calloutWidthPct !== undefined ||
    step.calloutScale !== undefined;
  const kindLabel = tooltip
    ? t('glStudio.calloutToPopover')
    : t('glStudio.calloutToTooltip');
  const KindIcon = tooltip ? MessageSquare : MessageSquareShare;
  return (
    <div
      role="group"
      aria-label={t('glStudio.calloutToolbar')}
      data-testid="gl-callout-toolbar"
      data-gl-callout-toolbar=""
      // A press here is a button press, never a canvas gesture.
      onPointerDown={(e) => e.stopPropagation()}
      // Keeps focus on the canvas, so Alt+arrows and typing still work after a click.
      onMouseDown={(e) => e.preventDefault()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="pointer-events-auto flex items-center gap-0.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white/95 p-1 shadow-lg"
    >
      <button
        type="button"
        onClick={onEdit}
        aria-label={t('glStudio.calloutEditText')}
        title={t('glStudio.calloutEditText')}
        className={buttonClass}
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onChange(clearCalloutPin(step))}
        disabled={!step.calloutPin && !step.calloutBox}
        aria-label={t('glStudio.calloutResetPosition')}
        title={t('glStudio.calloutResetPosition')}
        className={buttonClass}
      >
        <LocateFixed className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onChange(clearCalloutSize(step))}
        disabled={!sized}
        aria-label={t('glStudio.calloutResetSize')}
        title={t('glStudio.calloutResetSize')}
        className={buttonClass}
      >
        <Scaling className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onChange(toggleCalloutKind(step))}
        aria-label={kindLabel}
        title={kindLabel}
        className={buttonClass}
      >
        <KindIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
      <div
        role="group"
        aria-label={t('glStudio.calloutColour')}
        className="flex items-center gap-1 px-0.5"
      >
        {CALLOUT_TONES.map((option) => {
          const style = CALLOUT_TONE_STYLES[option];
          const checked = option === tone;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={checked}
              aria-label={t(style.labelKey)}
              title={t(style.labelKey)}
              onClick={() => onChange(setCalloutTone(step, option))}
              className={`flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1 ${style.swatch}`}
            >
              {checked && (
                <Check
                  className={`h-3.5 w-3.5 ${
                    option === 'light' ? 'text-slate-900' : 'text-white'
                  }`}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
      <button
        type="button"
        onClick={onDelete}
        aria-label={t('glStudio.calloutDeleteStep')}
        title={t('glStudio.calloutDeleteStep')}
        className={`${buttonClass} hover:bg-red-50 hover:text-red-700`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

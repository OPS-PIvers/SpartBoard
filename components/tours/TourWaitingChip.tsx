import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chromeSurfaceAttached } from '@/components/common/lightChrome';
import { secondaryBtn } from './tourButtons';

export interface TourWaiting {
  /** 1-based step number. */
  step: number;
  /** The step's picture, behind Show me where; absent when the step has none. */
  picture?: React.ReactNode;
  /** Takes the learner back to where the step plays; absent where that isn't known (P5). */
  onTakeBack?: () => void;
}

/** The tip folded into a calm chip under the step bar while a step's control isn't on screen (TOURS_10X.md P4). */
export const TourWaitingChip: React.FC<TourWaiting> = ({
  step,
  picture,
  onTakeBack,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div
      role="status"
      data-testid="tour-waiting-chip"
      className={`absolute left-1/2 top-full mt-2 w-max max-w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl p-2 ${chromeSurfaceAttached}`}
    >
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <p className="px-2 text-sm font-semibold text-slate-700">
          {t('tours.waitingChip', { step })}
        </p>
        {/* The two ways forward wrap together, never one per line. */}
        <div className="flex items-center gap-1">
          {picture && (
            // no-tour-anchor: tour playback chrome, never a tour's own target
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              data-testid="tour-show-me-where"
              onClick={() => setOpen((o) => !o)}
              className={secondaryBtn}
            >
              {open ? t('tours.hideWhere') : t('tours.showMeWhere')}
            </button>
          )}
          {onTakeBack && (
            // no-tour-anchor: tour playback chrome, never a tour's own target
            <button
              type="button"
              data-testid="tour-take-me-back"
              onClick={onTakeBack}
              className={secondaryBtn}
            >
              {t('tours.takeMeBack')}
            </button>
          )}
        </div>
      </div>
      {picture && open && (
        <div id={panelId} data-testid="tour-where-picture" className="mt-2">
          {picture}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningSet } from '@/types';
import { renderStepText } from '@/components/widgets/GuidedLearning/utils/richText';
import { tourPictureUrl } from '@/components/widgets/GuidedLearning/utils/liveTour';

/** A tour read as numbered steps, for screens where it can't run live. */
export const TourStepList: React.FC<{ set: GuidedLearningSet }> = ({ set }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3" data-testid="tour-step-list">
      <p className="text-sm text-slate-600">{t('tours.stepListNote')}</p>
      <ol className="flex flex-col gap-3">
        {set.steps.map((step, i) => {
          // Consecutive steps with the same picture show it once.
          const image = tourPictureUrl(step, set);
          const shown =
            image &&
            (i === 0 || tourPictureUrl(set.steps[i - 1], set) !== image)
              ? image
              : null;
          return (
            <li
              key={step.id}
              className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {step.label?.trim() && (
                  <p className="text-sm font-semibold text-slate-900">
                    {step.label}
                  </p>
                )}
                {step.text?.trim() && (
                  <p className="text-sm text-slate-700">
                    {renderStepText(step.text)}
                  </p>
                )}
                {shown && (
                  <img
                    src={shown}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="mt-1 w-full rounded-md border border-slate-200"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

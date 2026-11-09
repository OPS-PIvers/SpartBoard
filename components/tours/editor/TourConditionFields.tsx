import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { GuidedLearningTourBinding } from '@/types';
import {
  TOUR_DONE_FACTS,
  TOUR_FACT_IDS,
  isTourDoneFact,
  type TourConditionRef,
} from '@/config/tourConditions';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { iconBtn } from '@/components/tours/tourButtons';

type Binding = GuidedLearningTourBinding;

/** The step without the key, so Firestore never sees an undefined. */
const without = (tour: Binding, key: 'showWhen' | 'doneWhen'): Binding => {
  const next = { ...tour };
  delete next[key];
  return next;
};

/** A step's conditions: when it shows (showWhen) and what it waits for (doneWhen). */
export const TourConditionFields: React.FC<{
  tour: Binding;
  onChange: (next: Binding) => void;
  labelClass: string;
  inputClass: string;
}> = ({ tour, onChange, labelClass, inputClass }) => {
  const { t } = useTranslation();
  const refs = tour.showWhen ?? [];
  const nameOf = (ref: TourConditionRef) => {
    if (!ref.startsWith('feature:'))
      return t(`tours.shell.fact_${ref.replace(/-/g, '_')}`);
    const id = ref.slice('feature:'.length) as keyof typeof FEATURE_DEFAULTS;
    return t('tours.shell.featureOn', {
      name: FEATURE_DEFAULTS[id]?.label ?? id,
    });
  };
  const setRefs = (next: TourConditionRef[]) =>
    onChange(
      next.length > 0 ? { ...tour, showWhen: next } : without(tour, 'showWhen')
    );
  const addable = TOUR_FACT_IDS.filter((id) => !refs.includes(id));
  return (
    <>
      <div className={labelClass} data-testid="tour-editor-show-when">
        {t('tours.shell.showWhen')}
        {refs.length > 0 ? (
          <ul className="-mx-1 flex flex-col">
            {refs.map((ref) => (
              <li
                key={ref}
                className="flex items-center justify-between gap-2 rounded-lg py-0.5 pl-1 text-sm font-normal text-slate-700"
              >
                <span className="min-w-0 wrap-break-word">{nameOf(ref)}</span>
                {/* no-tour-anchor: the tour editor is never a tour target */}
                <button
                  type="button"
                  onClick={() => setRefs(refs.filter((r) => r !== ref))}
                  aria-label={t('tours.shell.removeCondition', {
                    name: nameOf(ref),
                  })}
                  title={t('tours.shell.removeCondition', {
                    name: nameOf(ref),
                  })}
                  className={iconBtn}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-sm font-normal text-slate-500">
            {t('tours.shell.always')}
          </span>
        )}
        {addable.length > 0 && (
          // no-tour-anchor: the tour editor is never a tour target
          <select
            value=""
            aria-label={t('tours.shell.addCondition')}
            onChange={(e) => {
              const id = addable.find((f) => f === e.target.value);
              if (id) setRefs([...refs, id]);
            }}
            className={inputClass}
          >
            <option value="">{t('tours.shell.addCondition')}</option>
            {addable.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
        )}
      </div>
      <label className={labelClass}>
        {t('tours.shell.doneWhen')}
        {/* no-tour-anchor: the tour editor is never a tour target */}
        <select
          value={tour.doneWhen ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            onChange(
              isTourDoneFact(value)
                ? { ...tour, doneWhen: value }
                : without(tour, 'doneWhen')
            );
          }}
          className={inputClass}
        >
          <option value="">{t('tours.shell.doneOnAction')}</option>
          {TOUR_DONE_FACTS.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
};

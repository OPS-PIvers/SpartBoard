import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GuidedLearningStep, GuidedLearningTourBinding } from '@/types';
import {
  TOUR_ANCHORS,
  isTourAnchorId,
  parseTourAnchorRef,
  tourAnchorRef,
  type TourAnchorDef,
  type TourAnchorId,
} from '@/config/tourAnchors';
import { TOOLS } from '@/config/tools';

interface StudioTourControlsProps {
  step: GuidedLearningStep;
  onChange: (step: GuidedLearningStep) => void;
}

const GROUPS = [
  'dock',
  'library',
  'widget',
  'settings',
  'sidebar',
  'board-nav',
  'board-actions',
] as const;

const ANCHOR_IDS = Object.keys(TOUR_ANCHORS) as TourAnchorId[];
const UNTAGGED = '__untagged';
const isPerWidgetType = (id: TourAnchorId): boolean => {
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  return !!def.perWidgetType;
};

const selectClass =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';

/** Links the selected step to a real button so the set can run as a live tour. */
export const StudioTourControls: React.FC<StudioTourControlsProps> = ({
  step,
  onChange,
}) => {
  const { t } = useTranslation();
  const tour = step.tour;
  const { id, widgetType } = parseTourAnchorRef(tour?.anchor ?? '');
  const anchorId = isTourAnchorId(id) ? id : null;
  const perType = anchorId ? isPerWidgetType(anchorId) : false;
  const selected = !tour ? '' : (anchorId ?? UNTAGGED);

  const withoutTour = (): GuidedLearningStep => {
    const next = { ...step };
    delete next.tour;
    return next;
  };
  const bind = (binding: GuidedLearningTourBinding) =>
    onChange({ ...step, tour: binding });

  const chooseAnchor = (value: string) => {
    if (value === selected) return;
    if (!value || !isTourAnchorId(value)) {
      onChange(withoutTour());
      return;
    }
    // A picked anchor replaces the recorder's name-based fallback.
    bind({
      anchor: tourAnchorRef(
        value,
        isPerWidgetType(value) ? widgetType : undefined
      ),
      action: tour?.action ?? 'click',
    });
  };

  return (
    <div
      className="flex flex-col gap-3 border-b border-slate-200 p-4"
      data-testid="gl-studio-tour-controls"
    >
      <div>
        <h3 className="text-xs font-bold text-slate-600">
          {t('glStudio.tourTitle')}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {t('glStudio.tourHint')}
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
        {t('glStudio.tourAnchor')}
        <select
          value={selected}
          onChange={(e) => chooseAnchor(e.target.value)}
          className={selectClass}
        >
          <option value="">{t('glStudio.tourNone')}</option>
          {selected === UNTAGGED && (
            <option value={UNTAGGED}>{t('glStudio.tourUntagged')}</option>
          )}
          {GROUPS.map((group) => (
            <optgroup key={group} label={t(`glStudio.tourGroup_${group}`)}>
              {ANCHOR_IDS.filter((a) => a.startsWith(`${group}.`)).map((a) => (
                <option key={a} value={a}>
                  {TOUR_ANCHORS[a].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {anchorId && perType && tour && (
        <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
          {t('glStudio.tourWidget')}
          <select
            value={widgetType ?? ''}
            onChange={(e) =>
              bind({
                ...tour,
                anchor: tourAnchorRef(anchorId, e.target.value || undefined),
              })
            }
            className={selectClass}
          >
            <option value="">{t('glStudio.tourWidgetPick')}</option>
            {TOOLS.map((tool) => (
              <option key={tool.type} value={tool.type}>
                {tool.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {tour && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-bold text-slate-600">
            {t('glStudio.tourAction')}
          </legend>
          <div className="grid grid-cols-2 gap-1">
            {(['click', 'observe'] as const).map((action) => (
              <button
                key={action}
                type="button"
                aria-pressed={tour.action === action}
                onClick={() => bind({ ...tour, action })}
                className={`rounded-md border px-2 py-1.5 text-xs font-bold transition-colors ${
                  tour.action === action
                    ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                }`}
              >
                {t(`glStudio.tourAction_${action}`)}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
};

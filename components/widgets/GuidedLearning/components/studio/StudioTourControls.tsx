import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Camera, Circle, Copy, Footprints } from 'lucide-react';
import type {
  GuidedLearningStep,
  GuidedLearningTourAction,
  GuidedLearningTourBinding,
  WidgetType,
} from '@/types';
import {
  TOUR_ANCHORS,
  isTourAnchorId,
  parseTourAnchorRef,
  tourAnchorRef,
  type TourAnchorDef,
  type TourAnchorId,
} from '@/config/tourAnchors';
import { TOOLS } from '@/config/tools';
import { teacherMustClick } from '@/components/tours/tourSession';
import { suggestAnchorId } from '../recorder/resolveAnchor';
import { MAX_TYPED_CHARS } from '../recorder/useTourCapture';
import { StudioFindOnBoard } from './StudioFindOnBoard';
import { fieldKeysForWidgetType, hasFieldSchema } from './tourFieldKeys';

interface StudioTourControlsProps {
  step: GuidedLearningStep;
  onChange: (step: GuidedLearningStep) => void;
  /** The tour's setup widgets, so Find on board can name a missing one. */
  setupWidgets?: readonly WidgetType[];
  /** Fades the Studio while Find on board flashes the button. */
  onPeekBoard?: (peeking: boolean) => void;
  /** Runs the saved draft live from this step. */
  onRunFromStep?: () => void;
  /** Captures one new click for this step. */
  onRerecord?: () => void;
  /** Runs the draft from this step and retakes its picture. */
  onRetakePicture?: () => void;
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
const isPerField = (id: TourAnchorId): boolean => {
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  return !!def.perField;
};

const actionClass =
  'flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40';

type CopyState = 'idle' | 'copied' | 'failed';

/** Warns that the recorder couldn't tag this step's button, with the id to tag it in code. */
const UntaggedWarning: React.FC<{
  fallback: GuidedLearningTourBinding['fallback'];
}> = ({ fallback }) => {
  const { t } = useTranslation();
  const suggested = suggestAnchorId(fallback);
  const [copy, setCopy] = useState<CopyState>('idle');
  const idRef = useRef<HTMLInputElement>(null);
  const copyId = async (id: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('No clipboard');
      await navigator.clipboard.writeText(id);
      setCopy('copied');
    } catch {
      // Blocked clipboard: select the id so the author can copy it by hand.
      setCopy('failed');
      idRef.current?.focus();
      idRef.current?.select();
    }
  };
  return (
    <div
      data-testid="gl-studio-untagged"
      className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900"
    >
      <p className="flex items-center gap-1.5 font-bold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t('glRecorder.untaggedTitle')}
      </p>
      <p>{t('glRecorder.untaggedBody')}</p>
      {suggested ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={idRef}
            readOnly
            value={suggested}
            aria-label={t('glStudio.tourSuggestedId')}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-2 py-1 font-mono text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          />
          <button
            type="button"
            onClick={() => void copyId(suggested)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 font-bold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {copy === 'copied'
              ? t('glRecorder.copied')
              : t('glRecorder.copyId')}
          </button>
        </div>
      ) : (
        <p className="font-semibold">{t('glRecorder.untaggedNoId')}</p>
      )}
      {copy === 'failed' && (
        <p role="alert" className="font-semibold">
          {t('glStudio.tourCopyFailed')}
        </p>
      )}
    </div>
  );
};

const ACTIONS: readonly GuidedLearningTourAction[] = [
  'click',
  'toggle',
  'select',
  'type',
  'observe',
];

/** Switches a binding's kind, keeping a value only where the new kind uses one of that shape. */
function withAction(
  tour: GuidedLearningTourBinding,
  action: GuidedLearningTourAction
): GuidedLearningTourBinding {
  const next: GuidedLearningTourBinding = { ...tour, action };
  delete next.value;
  if (action === 'toggle')
    next.value = typeof tour.value === 'boolean' ? tour.value : true;
  if (action === 'select' || action === 'type')
    next.value = typeof tour.value === 'string' ? tour.value : '';
  return next;
}

const segmentClass = (on: boolean) =>
  `rounded-md border px-2 py-1.5 text-xs font-bold transition-colors ${
    on
      ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
      : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
  }`;

const selectClass =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';

/** Links the selected step to a real button so the set can run as a live tour. */
export const StudioTourControls: React.FC<StudioTourControlsProps> = ({
  step,
  onChange,
  setupWidgets = [],
  onPeekBoard,
  onRunFromStep,
  onRerecord,
  onRetakePicture,
}) => {
  const { t } = useTranslation();
  const tour = step.tour;
  const { id, widgetType, fieldKey } = parseTourAnchorRef(tour?.anchor ?? '');
  const anchorId = isTourAnchorId(id) ? id : null;
  const perType = anchorId ? isPerWidgetType(anchorId) : false;
  const perField = anchorId ? isPerField(anchorId) : false;
  const needsWidgetType = perType || perField;
  const selected = !tour ? '' : (anchorId ?? UNTAGGED);

  const schemaAvailable =
    perField && !!widgetType && hasFieldSchema(widgetType as WidgetType);
  const [loadedKeys, setLoadedKeys] = useState<{
    type: string;
    keys: string[];
  } | null>(null);
  const fieldKeys =
    schemaAvailable && loadedKeys?.type === widgetType ? loadedKeys.keys : [];
  useEffect(() => {
    if (!schemaAvailable || !widgetType) return;
    let active = true;
    void fieldKeysForWidgetType(widgetType as WidgetType).then((keys) => {
      if (active) setLoadedKeys({ type: widgetType, keys });
    });
    return () => {
      active = false;
    };
  }, [schemaAvailable, widgetType]);

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
        isPerWidgetType(value) || isPerField(value) ? widgetType : undefined,
        isPerField(value) ? fieldKey : undefined
      ),
      action: tour?.action ?? 'click',
      ...(tour?.value !== undefined ? { value: tour.value } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="gl-studio-tour-controls">
      <div>
        <h3 className="text-xxs font-bold uppercase tracking-wider text-slate-500">
          {t('glStudio.tourTitle')}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {t('glStudio.tourHint')}
        </p>
      </div>
      {tour && !tour.anchor && <UntaggedWarning fallback={tour.fallback} />}
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
      {anchorId && (
        <p
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600"
          data-testid="gl-studio-tour-anchor-id"
        >
          <span>
            {t('glStudio.tourAnchorId')}{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
              {anchorId}
            </code>
          </span>
          {widgetType && (
            <span>
              {t('glStudio.tourAnchorWidgetType')}{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                {widgetType}
              </code>
            </span>
          )}
          {fieldKey && (
            <span>
              {t('glStudio.tourAnchorFieldKey')}{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                {fieldKey}
              </code>
            </span>
          )}
        </p>
      )}
      {tour && (
        <StudioFindOnBoard
          binding={tour}
          setupWidgets={setupWidgets}
          onPeek={onPeekBoard}
        />
      )}
      {anchorId && needsWidgetType && tour && (
        <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
          {t('glStudio.tourWidget')}
          <select
            value={widgetType ?? ''}
            onChange={(e) =>
              bind({
                ...tour,
                anchor: tourAnchorRef(
                  anchorId,
                  e.target.value || undefined,
                  perField ? fieldKey : undefined
                ),
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
      {anchorId && perField && tour && widgetType && (
        <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
          {t('glStudio.tourField')}
          {schemaAvailable ? (
            <select
              value={fieldKey ?? ''}
              onChange={(e) =>
                bind({
                  ...tour,
                  anchor: tourAnchorRef(
                    anchorId,
                    widgetType,
                    e.target.value || undefined
                  ),
                })
              }
              className={selectClass}
            >
              <option value="">{t('glStudio.tourFieldPick')}</option>
              {fieldKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={fieldKey ?? ''}
              placeholder={t('glStudio.tourFieldPlaceholder')}
              onChange={(e) =>
                bind({
                  ...tour,
                  anchor: tourAnchorRef(
                    anchorId,
                    widgetType,
                    e.target.value || undefined
                  ),
                })
              }
              className={selectClass}
            />
          )}
        </label>
      )}
      {tour && (
        <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
          {t('glStudio.tourAction')}
          <select
            value={tour.action}
            onChange={(e) =>
              bind(withAction(tour, e.target.value as GuidedLearningTourAction))
            }
            className={selectClass}
          >
            {ACTIONS.map((action) => (
              <option key={action} value={action}>
                {t(`glStudio.tourAction_${action}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {tour?.action === 'toggle' && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-bold text-slate-600">
            {t('glStudio.tourValueToggle')}
          </legend>
          <div className="grid grid-cols-2 gap-1">
            {([true, false] as const).map((on) => (
              <button
                key={String(on)}
                type="button"
                aria-pressed={tour.value === on}
                onClick={() => bind({ ...tour, value: on })}
                className={segmentClass(tour.value === on)}
              >
                {t(on ? 'glStudio.tourValueOn' : 'glStudio.tourValueOff')}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {(tour?.action === 'select' || tour?.action === 'type') && (
        <label className="flex flex-col gap-1.5 text-xs font-bold text-slate-600">
          {t(
            tour.action === 'type'
              ? 'glStudio.tourValueType'
              : 'glStudio.tourValueSelect'
          )}
          <input
            type="text"
            value={typeof tour.value === 'string' ? tour.value : ''}
            maxLength={MAX_TYPED_CHARS}
            onChange={(e) => bind({ ...tour, value: e.target.value })}
            className={selectClass}
          />
        </label>
      )}
      {tour?.action === 'type' && !tour.value && (
        <p
          data-testid="gl-studio-tour-empty-value"
          className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-900"
        >
          <AlertTriangle
            className="mt-px h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          {t('glStudio.tourValueEmpty')}
        </p>
      )}
      {tour?.action === 'click' && (
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={teacherMustClick(tour, 'destructive-only')}
            onChange={(e) =>
              bind({ ...tour, teacherMustClick: e.target.checked })
            }
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-blue-primary"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-bold">
              {t('glStudio.tourTeacherMustClick')}
            </span>
            <span className="text-slate-500">
              {t('glStudio.tourTeacherMustClickHint')}
            </span>
          </span>
        </label>
      )}
      {(!!onRunFromStep || !!onRerecord || !!onRetakePicture) && (
        <div className="flex flex-wrap gap-2">
          {onRunFromStep && (
            <button
              type="button"
              onClick={onRunFromStep}
              className={actionClass}
            >
              <Footprints className="h-4 w-4" aria-hidden="true" />
              {t('glStudio.runLiveFromStep')}
            </button>
          )}
          {onRerecord && (
            <button type="button" onClick={onRerecord} className={actionClass}>
              <Circle className="h-3.5 w-3.5" aria-hidden="true" />
              {t('glStudio.rerecordStep')}
            </button>
          )}
          {onRetakePicture && (
            <button
              type="button"
              onClick={onRetakePicture}
              className={actionClass}
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              {t('glStudio.retakePicture')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

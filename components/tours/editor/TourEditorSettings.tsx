import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  PencilLine,
  X,
} from 'lucide-react';
import type { GuidedLearningSet, InternalToolType, WidgetType } from '@/types';
import { TOOLS } from '@/config/tools';
import { AuthContext } from '@/context/AuthContextValue';
import { useToolLabel } from '@/hooks/useToolLabel';
import { logError } from '@/utils/logError';
import {
  publishTour,
  usePublishedTour,
} from '@/components/tours/publishedTours';
import {
  tourPublishStatus,
  type TourPublishStatus,
} from '@/components/tours/tourSnapshot';
import { tourHealthOf } from '@/components/tours/tourHealth';
import {
  iconBtn,
  primaryBtn,
  secondaryBtn,
} from '@/components/tours/tourButtons';
import { inputLight } from '@/components/common/lightChrome';
import { isHelpCenterSet } from '@/components/widgets/GuidedLearning/utils/helpCenterSets';
import { getTourEdit, useTourEditTarget } from './tourEditStore';
import { TourMaterialsSection } from './TourMaterialsSection';
import type { TourEditorSession } from './useTourEditorSession';
import { TourHelpVisibility } from './TourHelpVisibility';

const INTERNAL_TOOLS: readonly string[] = [
  'record',
  'magic',
  'remote',
] satisfies InternalToolType[];
const WIDGET_TYPES = TOOLS.map((tool) => tool.type).filter(
  (type): type is WidgetType => !INTERNAL_TOOLS.includes(type)
);

const STATUS_ICON: Record<
  TourPublishStatus,
  { icon: typeof CheckCircle2; className: string }
> = {
  draft: { icon: PencilLine, className: 'text-slate-500' },
  published: { icon: CheckCircle2, className: 'text-emerald-600' },
  changed: { icon: AlertCircle, className: 'text-amber-600' },
};

const sectionTitle = 'text-xs font-semibold text-slate-700';
const checkbox =
  'mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-blue-primary [color-scheme:light]';

/** The editor's Settings tab: publishing, Help visibility and how the tour starts. */
export const TourEditorSettings: React.FC<{ session: TourEditorSession }> = ({
  session,
}) => {
  const { set } = session;
  const setup = set.tourSetup;
  const v2 = !!useTourEditTarget()?.v2;
  const patchSetup = (patch: Partial<NonNullable<typeof setup>>) => {
    const next = { ...setup, widgets: setup?.widgets ?? [], ...patch };
    // Firestore rejects undefined, so a cleared flag is removed, not set to undefined.
    if (!next.useTeacherBoard) delete next.useTeacherBoard;
    if (!next.autopilot) delete next.autopilot;
    if (!next.materials) delete next.materials;
    session.updateSet({ tourSetup: next });
  };
  return (
    <div className="flex flex-col divide-y divide-slate-200">
      <PublishSection session={session} />
      <SetupWidgets
        widgets={setup?.widgets ?? []}
        layoutCount={setup?.layouts?.length ?? 0}
        onChange={(widgets) => patchSetup({ widgets })}
      />
      {v2 && (
        <TourMaterialsSection
          materials={setup?.materials ?? []}
          onChange={(materials) =>
            patchSetup(
              materials.length > 0 ? { materials } : { materials: undefined }
            )
          }
        />
      )}
      <StartOptions set={set} onChange={patchSetup} />
    </div>
  );
};

const PublishSection: React.FC<{ session: TourEditorSession }> = ({
  session,
}) => {
  const { t, i18n } = useTranslation();
  const uid = useContext(AuthContext)?.user?.uid;
  const { set } = session;
  const { loaded, tour } = usePublishedTour(set.id);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [failed, setFailed] = useState(false);

  const status = tourPublishStatus(set, tour);
  const broken = tourHealthOf(set).filter((h) => h.problem !== null);
  const { icon: StatusIcon, className: iconClass } = STATUS_ICON[status];

  const publish = async () => {
    if (!uid) return;
    setConfirming(false);
    setPublishing(true);
    setFailed(false);
    try {
      // A failed save shows the editor's own save error; nothing is published.
      const saved = await session.flush();
      const latest = getTourEdit()?.set;
      if (saved && latest) await publishTour(latest, uid);
    } catch (err) {
      logError('TourEditorSettings', err, { setId: set.id });
      setFailed(true);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section
      aria-labelledby="tour-editor-publish-title"
      data-testid="tour-editor-publish"
      className="flex flex-col gap-2 pb-4"
    >
      <h3 id="tour-editor-publish-title" className={sectionTitle}>
        {t('glStudio.tourPublish.title')}
      </h3>
      {loaded && (
        <p
          role="status"
          data-status={status}
          className="flex items-center gap-1.5 text-sm text-slate-900"
        >
          <StatusIcon
            className={`h-4 w-4 shrink-0 ${iconClass}`}
            aria-hidden="true"
          />
          {t(`glStudio.tourPublish.status_${status}`)}
        </p>
      )}
      {tour && tour.publishedAt > 0 && (
        <p className="text-xs text-slate-500">
          {t('glStudio.tourPublish.publishedAt', {
            when: new Date(tour.publishedAt).toLocaleString(i18n.language, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </p>
      )}
      {confirming ? (
        <div
          role="alert"
          className="flex flex-col gap-2 text-xs text-slate-900"
        >
          <p className="flex items-start gap-1.5 font-semibold">
            <AlertTriangle
              className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            {t('glStudio.tourPublish.brokenTitle', { count: broken.length })}
          </p>
          <ul className="flex flex-col gap-0.5 pl-5 text-slate-600">
            {broken.map(({ step, number, problem }) => (
              <li key={step.id} className="list-disc">
                {t('glStudio.tourPublish.brokenStep', {
                  number,
                  reason: t(`glStudio.tourPublish.problem_${problem}`),
                })}
              </li>
            ))}
          </ul>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => void publish()}
              className={primaryBtn}
            >
              {t('glStudio.tourPublish.publishAnyway')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={secondaryBtn}
            >
              {t('glStudio.tourPublish.cancel')}
            </button>
          </div>
        </div>
      ) : (
        status !== 'published' && (
          <button
            type="button"
            data-testid="tour-editor-publish-button"
            onClick={() =>
              broken.length > 0 ? setConfirming(true) : void publish()
            }
            disabled={!loaded || publishing || !uid}
            className={`${primaryBtn} self-start disabled:opacity-40`}
          >
            {publishing
              ? t('glStudio.tourPublish.publishing')
              : t(
                  status === 'draft'
                    ? 'glStudio.tourPublish.publish'
                    : 'glStudio.tourPublish.republish'
                )}
          </button>
        )
      )}
      {failed && (
        <p
          role="alert"
          className="text-xs font-semibold text-brand-red-primary"
        >
          {t('glStudio.tourPublish.failed')}
        </p>
      )}
      {isHelpCenterSet(set) && (
        <TourHelpVisibility
          setId={set.id}
          published={loaded && status !== 'draft'}
        />
      )}
    </section>
  );
};

const SetupWidgets: React.FC<{
  widgets: readonly WidgetType[];
  layoutCount: number;
  onChange: (widgets: WidgetType[]) => void;
}> = ({ widgets, layoutCount, onChange }) => {
  const { t } = useTranslation();
  const toolLabel = useToolLabel();
  const labelOf = (type: WidgetType) => toolLabel(type) || type;
  const unique = [...new Set(widgets)];
  const addable = WIDGET_TYPES.filter((type) => !unique.includes(type)).sort(
    (a, b) => labelOf(a).localeCompare(labelOf(b))
  );
  return (
    <section
      aria-labelledby="tour-editor-setup-title"
      data-testid="tour-editor-setup"
      className="flex flex-col gap-2 py-4"
    >
      <h3
        id="tour-editor-setup-title"
        className={sectionTitle}
        title={t('glStudio.tourSetupHint')}
      >
        {t('glStudio.tourSetupTitle')}
      </h3>
      {unique.length > 0 ? (
        <ul className="-mx-1 flex flex-col">
          {unique.map((type) => (
            <li
              key={type}
              className="flex items-center justify-between gap-2 rounded-lg py-0.5 pl-1 text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="truncate">{labelOf(type)}</span>
              <button
                type="button"
                onClick={() => onChange(unique.filter((w) => w !== type))}
                aria-label={t('glStudio.tourSetupRemove', {
                  widget: labelOf(type),
                })}
                title={t('glStudio.tourSetupRemove', { widget: labelOf(type) })}
                className={iconBtn}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{t('glStudio.tourSetupNone')}</p>
      )}
      <select
        value=""
        aria-label={t('glStudio.tourSetupAdd')}
        onChange={(e) => {
          const type = WIDGET_TYPES.find((w) => w === e.target.value);
          if (type) onChange([...unique, type]);
        }}
        className={`w-full rounded-lg px-2.5 py-1.5 text-sm ${inputLight}`}
      >
        <option value="">{t('glStudio.tourSetupAdd')}</option>
        {addable.map((type) => (
          <option key={type} value={type}>
            {labelOf(type)}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-500">
        {layoutCount > 0
          ? t('glStudio.tourLayoutCount', { count: layoutCount })
          : t('glStudio.tourLayoutNone')}
      </p>
    </section>
  );
};

const StartOptions: React.FC<{
  set: GuidedLearningSet;
  onChange: (
    patch: Partial<NonNullable<GuidedLearningSet['tourSetup']>>
  ) => void;
}> = ({ set, onChange }) => {
  const { t } = useTranslation();
  const setup = set.tourSetup;
  return (
    <section
      aria-label={t('tours.editor.startOptions')}
      className="flex flex-col gap-3 pt-4"
    >
      <label
        className="flex items-start gap-2 text-sm text-slate-700"
        title={t('glStudio.tourUseTeacherBoardHint')}
      >
        <input
          type="checkbox"
          checked={setup?.useTeacherBoard === true}
          onChange={(e) =>
            onChange({ useTeacherBoard: e.target.checked || undefined })
          }
          className={checkbox}
        />
        {t('glStudio.tourUseTeacherBoard')}
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          data-testid="tour-editor-autopilot"
          checked={setup?.autopilot === true}
          onChange={(e) =>
            onChange({ autopilot: e.target.checked || undefined })
          }
          className={checkbox}
        />
        {t('tours.editor.startAutopilot')}
      </label>
    </section>
  );
};

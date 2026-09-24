import React, {
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  PencilLine,
} from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import {
  getToursVersion,
  publishTour,
  readPublishedTour,
  watchTours,
} from '@/components/tours/publishedTours';
import {
  tourPublishStatus,
  type TourPublishStatus,
} from '@/components/tours/tourSnapshot';
import { tourHealthOf } from '@/components/tours/tourHealth';
import { logError } from '@/utils/logError';

const STATUS_STYLE: Record<
  TourPublishStatus,
  { icon: typeof CheckCircle2; className: string }
> = {
  draft: { icon: PencilLine, className: 'bg-slate-100 text-slate-700' },
  published: {
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-800',
  },
  changed: { icon: AlertCircle, className: 'bg-amber-50 text-amber-800' },
};

const usePublishedTour = (setId: string) => {
  const subscribe = useCallback(
    (onChange: () => void) => watchTours([setId], onChange),
    [setId]
  );
  useSyncExternalStore(subscribe, getToursVersion, getToursVersion);
  return readPublishedTour(setId);
};

/** Publishes the set's tour to teachers and shows whether they run the latest edits. */
export const StudioTourPublish: React.FC<{
  set: GuidedLearningSet;
  /** Saves the draft first; resolves the saved set to publish, or null when the save failed. */
  saveFirst?: () => Promise<GuidedLearningSet | null>;
}> = ({ set, saveFirst }) => {
  const { t, i18n } = useTranslation();
  const uid = useContext(AuthContext)?.user?.uid;
  const { loaded, tour } = usePublishedTour(set.id);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [failed, setFailed] = useState(false);

  const status = tourPublishStatus(set, tour);
  const broken = tourHealthOf(set).filter((h) => h.problem !== null);
  const { icon: StatusIcon, className: statusClass } = STATUS_STYLE[status];

  const publish = async () => {
    if (!uid) return;
    setConfirming(false);
    setPublishing(true);
    setFailed(false);
    try {
      // A failed save shows the Studio's own save error; nothing is published.
      const saved = saveFirst ? await saveFirst() : set;
      if (saved) await publishTour(saved, uid);
    } catch (err) {
      logError('StudioTourPublish', err, { setId: set.id });
      setFailed(true);
    } finally {
      setPublishing(false);
    }
  };

  const onPublishClick = () => {
    if (broken.length > 0) setConfirming(true);
    else void publish();
  };

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
      aria-labelledby="gl-studio-tour-publish-title"
      data-testid="gl-studio-tour-publish"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4
          id="gl-studio-tour-publish-title"
          className="text-xs font-bold text-slate-600"
        >
          {t('glStudio.tourPublish.title')}
        </h4>
        {loaded && (
          <span
            role="status"
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${statusClass}`}
          >
            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {t(`glStudio.tourPublish.status_${status}`)}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">{t('glStudio.tourPublish.hint')}</p>
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
      {confirming && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900"
        >
          <p className="flex items-start gap-1.5 font-bold">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            {t('glStudio.tourPublish.brokenTitle', { count: broken.length })}
          </p>
          <ul className="flex flex-col gap-0.5 pl-5">
            {broken.map(({ step, number, problem }) => (
              <li key={step.id} className="list-disc">
                {t('glStudio.tourPublish.brokenStep', {
                  number,
                  reason: t(`glStudio.tourPublish.problem_${problem}`),
                })}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void publish()}
              className="rounded-md bg-amber-700 px-2.5 py-1.5 font-bold text-white hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {t('glStudio.tourPublish.publishAnyway')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-bold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {t('glStudio.tourPublish.cancel')}
            </button>
          </div>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-xs font-bold text-brand-red-primary">
          {t('glStudio.tourPublish.failed')}
        </p>
      )}
      {!confirming && status !== 'published' && (
        <button
          type="button"
          onClick={onPublishClick}
          disabled={!loaded || publishing || !uid}
          className="self-start rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light"
        >
          {publishing
            ? t('glStudio.tourPublish.publishing')
            : t(
                status === 'draft'
                  ? 'glStudio.tourPublish.publish'
                  : 'glStudio.tourPublish.republish'
              )}
        </button>
      )}
    </section>
  );
};

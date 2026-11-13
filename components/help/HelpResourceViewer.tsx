import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Footprints,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
} from 'lucide-react';
import type { HelpResourceItem } from '@/types/helpCenter';
import type { GuidedLearningSet } from '@/types';
import { incrementHelpOpenCount } from '@/hooks/useHelpResources';
import { HelpCopyLinkButton } from './HelpCopyLinkButton';
import { loadBuildingSet } from '@/hooks/useGuidedLearning';
import { logError } from '@/utils/logError';
import { useAuth } from '@/context/useAuth';
import { requestStartTour } from '@/components/tours/tourState';
import { requestEditTour } from '@/components/tours/editor/tourEditStore';
import { useFirstRunnableTour } from '@/components/tours/useTourOffers';
import {
  isTourRunnable,
  usePublishedTour,
} from '@/components/tours/publishedTours';
import { isWebTourSet } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { tourAttr } from '@/config/tourAnchors';
import { liveTourStepsOf, tourStepsOf } from '@/components/tours/tourSession';
import { LiveTourStepsView } from '@/components/tours/steps/LiveTourStepsView';
import { TourStepList } from '@/components/tours/TourStepList';
import { useCanRunLiveTour } from '@/components/tours/useCanRunLiveTour';

// Lazy so the Help modal never pulls the Guided Learning player until a guide opens.
const GuidedLearningPlayer = lazy(() =>
  import('@/components/widgets/GuidedLearning/components/GuidedLearningPlayer').then(
    (m) => ({ default: m.GuidedLearningPlayer })
  )
);

interface HelpResourceViewerProps {
  item: HelpResourceItem;
  onBack: () => void;
}

type GlState =
  | { status: 'loading' }
  | { status: 'ready'; set: GuidedLearningSet }
  | { status: 'missing' };

// Keyed on setId by the caller, so a different set remounts instead of resetting state in an effect.
const GuidedLearningViewer: React.FC<{ setId: string; fill: boolean }> = ({
  setId,
  fill,
}) => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const published = usePublishedTour(setId);
  const [state, setState] = useState<GlState>({ status: 'loading' });
  const canRunLive = useCanRunLiveTour();
  const hasTour = useFirstRunnableTour([setId], !fill && canRunLive) !== null;
  // Admins can open a tour that was never published in the editor; teachers never see it.
  const draftOnly =
    !hasTour &&
    !!isAdmin &&
    !fill &&
    canRunLive &&
    isTourRunnable(setId) === false;

  useEffect(() => {
    let cancelled = false;
    loadBuildingSet(setId)
      .then((set) => {
        if (cancelled) return;
        // A web tour plays through the extension, never here.
        setState(
          set && !isWebTourSet(set)
            ? { status: 'ready', set }
            : { status: 'missing' }
        );
      })
      .catch((err) => {
        logError('HelpResourceViewer loadBuildingSet', err);
        if (!cancelled) setState({ status: 'missing' });
      });
    return () => {
      cancelled = true;
    };
  }, [setId]);

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <p className="py-16 text-center text-sm text-slate-500">
        {t('helpCenter.guides.activityUnavailable')}
      </p>
    );
  }

  const editDraft = draftOnly && tourStepsOf(state.set).length > 0;
  // The published snapshot is what Start Live Tour plays, so it is what the steps read from.
  // Only admins read an unpublished draft's steps; teachers keep the player until a snapshot exists.
  const stepsSet =
    published.tour && !isWebTourSet(published.tour.set)
      ? published.tour.set
      : isAdmin
        ? state.set
        : null;
  if (published.loaded && stepsSet && liveTourStepsOf(stepsSet).length > 0) {
    const start = hasTour || editDraft;
    return (
      <div
        className={
          fill ? 'h-full overflow-y-auto bg-white p-4 pb-8' : 'flex flex-col'
        }
      >
        <div className="flex flex-col gap-5">
          {start && (
            <div>
              <button
                type="button"
                onClick={() =>
                  editDraft
                    ? requestEditTour({ setId })
                    : requestStartTour({ setId })
                }
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-blue-primary px-4 text-sm font-semibold text-white hover:bg-brand-blue-dark focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-light"
                {...tourAttr('help-center.viewer.start-live-tour')}
              >
                {editDraft ? (
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Footprints className="w-4 h-4" aria-hidden="true" />
                )}
                {editDraft ? t('tours.editor.open') : t('tourSteps.startLive')}
              </button>
            </div>
          )}
          <LiveTourStepsView set={stepsSet} />
        </div>
      </div>
    );
  }

  const offBoardTour =
    !canRunLive && (state.set.hasLiveTour ?? tourStepsOf(state.set).length > 0);
  if (offBoardTour) {
    return (
      <div
        className={fill ? 'h-full overflow-y-auto bg-slate-50 p-4 pb-8' : ''}
      >
        <TourStepList set={state.set} />
      </div>
    );
  }

  const player = (
    <div
      className={`relative w-full overflow-hidden bg-slate-900 ${
        fill ? 'h-full' : 'aspect-video rounded-lg'
      }`}
      style={{ containerType: 'size' }}
    >
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        }
      >
        <GuidedLearningPlayer set={state.set} teacherMode />
      </Suspense>
    </div>
  );

  if (!hasTour && !editDraft) return player;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-sm text-slate-600">{t('tours.liveHint')}</p>
        <button
          type="button"
          onClick={() =>
            editDraft ? requestEditTour({ setId }) : requestStartTour({ setId })
          }
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue-dark focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-light"
          {...tourAttr('help-center.viewer.show-live')}
        >
          {editDraft ? (
            <Pencil className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Footprints className="w-4 h-4" aria-hidden="true" />
          )}
          {editDraft ? t('tours.editor.open') : t('tours.showMeLive')}
        </button>
      </div>
      {player}
    </div>
  );
};

export const HelpResourceViewer: React.FC<HelpResourceViewerProps> = ({
  item,
  onBack,
}) => {
  const { t } = useTranslation();
  const backRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canFullscreen =
    typeof document !== 'undefined' && !!document.fullscreenEnabled;

  useEffect(() => {
    void incrementHelpOpenCount(item.id);
  }, [item.id]);

  // Esc and browser chrome can exit fullscreen without us, so mirror the DOM state.
  useEffect(() => {
    const sync = () =>
      setIsFullscreen(
        !!contentRef.current &&
          document.fullscreenElement === contentRef.current
      );
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        /* ignore */
      });
      return;
    }
    contentRef.current?.requestFullscreen().catch((err: unknown) => {
      logError('HelpResourceViewer requestFullscreen', err);
    });
  };

  useEffect(() => {
    backRef.current?.focus();
  }, [item.id]);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          ref={backRef}
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          {...tourAttr('help-center.viewer.back')}
        >
          <ArrowLeft className="w-4 h-4" />
          {t('helpCenter.guides.back')}
        </button>
        <span className="ml-auto" aria-hidden="true" />
        <HelpCopyLinkButton item={item} variant="text" />
        {canFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            {...tourAttr('help-center.viewer.fullscreen')}
          >
            <Maximize2 className="w-4 h-4" />
            {t('helpCenter.guides.fullscreen')}
          </button>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="text-base font-black text-slate-900">{item.title}</h3>
        {item.description && (
          <p className="mt-1 text-sm text-slate-500">{item.description}</p>
        )}
      </div>

      <div
        ref={contentRef}
        className={
          isFullscreen ? 'relative h-full w-full bg-slate-900' : 'min-w-0'
        }
      >
        {item.kind === 'guided-learning' && item.setId ? (
          <GuidedLearningViewer
            key={item.setId}
            setId={item.setId}
            fill={isFullscreen}
          />
        ) : (
          <p className="py-16 text-center text-sm text-slate-500">
            {t('helpCenter.guides.activityUnavailable')}
          </p>
        )}
        {isFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-xs hover:bg-slate-900/90 transition-colors"
            {...tourAttr('help-center.viewer.fullscreen')}
          >
            <Minimize2 className="w-3.5 h-3.5" />
            {t('helpCenter.guides.exitFullscreen')}
          </button>
        )}
      </div>
    </div>
  );
};

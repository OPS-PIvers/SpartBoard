import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Link2,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import {
  GETTING_STARTED_PATH,
  GETTING_STARTED_SHORT_CODE,
} from '@/config/gettingStarted';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { HelpCopyLinkButton } from '@/components/help/HelpCopyLinkButton';
import { Sparty } from '@/components/sparty/Sparty';
import { useShowSparty } from '@/components/sparty/useShowSparty';
import { useCanRunLiveTour } from '@/components/tours/useCanRunLiveTour';
import { requestStartTour } from '@/components/tours/tourState';
import { useCopyShortLink } from '@/hooks/useCopyShortLink';
import {
  useGettingStarted,
  type GettingStartedTour,
} from '@/hooks/useGettingStarted';
import { incrementHelpOpenCount } from '@/hooks/useHelpResources';
import { resetGettingStartedProgress } from '@/utils/gettingStartedProgress';
import { spaNavigate } from '@/utils/plcPath';

const CopyPageLinkButton: React.FC = () => {
  const { t } = useTranslation();
  const { state, copy } = useCopyShortLink('GettingStartedPage');
  return (
    <button
      {...tourAttr('getting-started.copy-page-link')}
      type="button"
      onClick={() =>
        void copy({
          destination: `${window.location.origin}${GETTING_STARTED_PATH}`,
          code: GETTING_STARTED_SHORT_CODE,
          label: 'Getting Started',
        })
      }
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
    >
      {state === 'working' ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : state === 'done' ? (
        <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
      ) : (
        <Link2 className="w-4 h-4" aria-hidden="true" />
      )}
      {state === 'done'
        ? t('helpCenter.guides.linkCopied')
        : t('gettingStarted.copyPageLink', { defaultValue: 'Copy page link' })}
    </button>
  );
};

const TourRow: React.FC<{
  tour: GettingStartedTour;
  canRun: boolean;
  onStart: (tour: GettingStartedTour) => void;
}> = ({ tour, canRun, onStart }) => {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-3 py-3">
      {tour.done ? (
        <CheckCircle2
          className="w-5 h-5 shrink-0 text-emerald-600"
          role="img"
          aria-label={t('gettingStarted.done', { defaultValue: 'Done' })}
        />
      ) : (
        <Circle
          className="w-5 h-5 shrink-0 text-slate-300"
          role="img"
          aria-label={t('gettingStarted.notDone', {
            defaultValue: 'Not done',
          })}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 break-words">
          {tour.item.title}
        </p>
        {tour.item.description && (
          <p className="mt-0.5 text-sm text-slate-600 break-words">
            {tour.item.description}
          </p>
        )}
      </div>
      <HelpCopyLinkButton item={tour.item} variant="icon" />
      {canRun && (
        <button
          {...tourFieldAttr(
            'getting-started.start-tour',
            'getting-started',
            tour.itemId
          )}
          type="button"
          onClick={() => onStart(tour)}
          className={`min-h-11 shrink-0 rounded-lg border px-4 text-sm font-semibold transition-colors ${
            tour.done
              ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
              : 'border-brand-blue-primary text-brand-blue-primary hover:bg-brand-blue-lighter/40'
          }`}
        >
          {tour.done
            ? t('gettingStarted.replay', { defaultValue: 'Replay' })
            : t('gettingStarted.start', { defaultValue: 'Start' })}
        </button>
      )}
    </li>
  );
};

/** `/getting-started`, over the board inside the teacher shell so a tour starts on the warm board (D16). */
export const GettingStartedPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const { showConfirm, currentDialog } = useDialog();
  const dialogOpen = currentDialog !== null;
  const { addToast } = useDashboard();
  const showSparty = useShowSparty();
  const canRun = useCanRunLiveTour();
  const { loading, essentials, nextSteps, essentialsDone, nextEssential } =
    useGettingStarted();

  const close = useCallback(() => spaNavigate('/'), []);

  useEffect(() => {
    // The Restart confirm handles its own Escape.
    if (dialogOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, dialogOpen]);

  const startTour = (tour: GettingStartedTour) => {
    void incrementHelpOpenCount(tour.itemId);
    spaNavigate('/');
    requestStartTour({ setId: tour.setId });
  };

  const restart = async () => {
    if (!user) return;
    const confirmed = await showConfirm(
      t('gettingStarted.restartBody', {
        defaultValue:
          'This clears your own checkmarks. Setup you already did stays checked.',
      }),
      {
        title: t('gettingStarted.restart', {
          defaultValue: 'Restart Getting Started',
        }),
        confirmLabel: t('gettingStarted.restartConfirm', {
          defaultValue: 'Restart',
        }),
      }
    );
    if (!confirmed) return;
    try {
      await resetGettingStartedProgress(user.uid);
    } catch {
      addToast(
        t('gettingStarted.restartFailed', {
          defaultValue: "Couldn't restart. Try again.",
        }),
        'error'
      );
    }
  };

  const total = essentials.length;
  const allDone = total > 0 && essentialsDone === total;
  const isEmpty = !loading && total === 0 && nextSteps.length === 0;

  return (
    <div
      className="fixed inset-0 z-modal h-screen [height:100dvh] overflow-y-auto overscroll-none bg-slate-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="getting-started-title"
    >
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-16 md:px-6 md:pt-6">
        <button
          {...tourAttr('getting-started.close')}
          type="button"
          onClick={close}
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          {t('gettingStarted.back', { defaultValue: 'Back to board' })}
        </button>

        <header className="mt-4 flex items-center gap-4">
          {showSparty && (
            <Sparty
              pose={allDone ? 'cheer' : 'wave'}
              size={64}
              decorative
              className="shrink-0"
            />
          )}
          <div className="min-w-0">
            <h1
              id="getting-started-title"
              className="text-2xl font-black text-slate-900"
            >
              {t('gettingStarted.title', { defaultValue: 'Getting Started' })}
            </h1>
            {total > 0 && (
              <p className="mt-0.5 text-sm font-semibold text-slate-600">
                {t('gettingStarted.progress', {
                  defaultValue: '{{done}} of {{total}} essentials done',
                  done: essentialsDone,
                  total,
                })}
              </p>
            )}
          </div>
          {canRun && nextEssential && (
            <button
              {...tourAttr('getting-started.resume')}
              type="button"
              onClick={() => startTour(nextEssential)}
              className="ml-auto min-h-11 shrink-0 rounded-lg bg-brand-blue-primary px-5 text-sm font-bold text-white transition-colors hover:bg-brand-blue-dark"
            >
              {essentialsDone > 0
                ? t('gettingStarted.resume', { defaultValue: 'Resume' })
                : t('gettingStarted.start', { defaultValue: 'Start' })}
            </button>
          )}
        </header>

        {!canRun && (
          <p className="mt-4 text-sm text-slate-600">
            {t('gettingStarted.biggerScreen', {
              defaultValue: 'Tours need a bigger screen.',
            })}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          </div>
        ) : isEmpty ? (
          <p className="py-16 text-center text-sm text-slate-600">
            {t('gettingStarted.empty', { defaultValue: 'No tours yet.' })}
          </p>
        ) : (
          <>
            {essentials.length > 0 && (
              <section className="mt-8">
                <h2 className="text-sm font-bold text-slate-900">
                  {t('gettingStarted.essentials', {
                    defaultValue: 'Essentials',
                  })}
                </h2>
                <ul className="mt-1 divide-y divide-slate-200 border-y border-slate-200">
                  {essentials.map((tour) => (
                    <TourRow
                      key={tour.itemId}
                      tour={tour}
                      canRun={canRun}
                      onStart={startTour}
                    />
                  ))}
                </ul>
              </section>
            )}
            {nextSteps.length > 0 && (
              <section className="mt-8">
                <h2 className="text-sm font-bold text-slate-900">
                  {t('gettingStarted.nextSteps', {
                    defaultValue: 'Next steps',
                  })}
                </h2>
                <ul className="mt-1 divide-y divide-slate-200 border-y border-slate-200">
                  {nextSteps.map((tour) => (
                    <TourRow
                      key={tour.itemId}
                      tour={tour}
                      canRun={canRun}
                      onStart={startTour}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {isAdmin === true && (
          <footer className="mt-8 flex flex-wrap items-center gap-2">
            <CopyPageLinkButton />
            <button
              {...tourAttr('getting-started.restart')}
              type="button"
              onClick={() => void restart()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              {t('gettingStarted.restart', {
                defaultValue: 'Restart Getting Started',
              })}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

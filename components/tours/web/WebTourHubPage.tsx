import React, {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { loadPublishedTour } from '@/components/tours/publishedTours';
import { startTourRunLog, type TourRunLog } from '@/components/tours/tourRuns';
import { logError } from '@/utils/logError';
import {
  canPlayWebTours,
  pingExtension,
  startWebTour,
  watchWebTour,
  type ExtensionStatus,
  type WebTourPortEvent,
} from './extensionClient';
import {
  buildHandoff,
  loadPictures,
  eventFitsTour,
  pageUrlOf,
  reducePlay,
  startUrlOf,
  type HubPlay,
  type HubStep,
  type LoadedPicture,
} from './webTourHub';
import { parseTourPath } from './tourLinks';
import {
  isWebTourSet,
  webTourStepsOf,
} from '@/components/widgets/GuidedLearning/utils/liveTour';

const SignInPage = lazy(() =>
  import('@/components/auth/SignInPage').then((m) => ({
    default: m.SignInPage,
  }))
);

interface HubTour {
  title: string;
  version: number;
  steps: HubStep[];
  startUrl: string;
}

type TourLoad =
  { kind: 'loading' } | { kind: 'missing' } | { kind: 'ready'; tour: HubTour };

const MAX_RECONNECTS = 5;

async function loadHubTour(setId: string): Promise<HubTour | null> {
  const published = await loadPublishedTour(setId);
  const set = published?.set;
  if (!published || !set || !isWebTourSet(set)) return null;
  const steps = webTourStepsOf(set);
  const startUrl = startUrlOf(steps);
  if (steps.length === 0 || !startUrl) return null;
  return { title: set.title, version: published.publishedAt, steps, startUrl };
}

const Loader: React.FC = () => (
  <div className="h-screen [height:100dvh] w-full flex items-center justify-center bg-white">
    <Loader2
      className="w-8 h-8 text-slate-400 animate-spin"
      aria-hidden="true"
    />
  </div>
);

const Unavailable: React.FC = () => {
  const { t } = useTranslation();
  return (
    <main className="h-screen [height:100dvh] overflow-y-auto bg-white px-4 py-12 pb-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold text-slate-900">
          {t('webTourHub.unavailableTitle')}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {t('webTourHub.unavailableBody')}
        </p>
      </div>
    </main>
  );
};

/** The `/tour/{setId}` page: hands a web tour to the extension, or shows it as pictures. */
export const WebTourHubPage: React.FC = () => {
  const { user, loading, globalPermissionsLoaded, isAdmin, canAccessFeature } =
    useAuth();
  if (loading) return <Loader />;
  if (!user) {
    return (
      <Suspense fallback={<Loader />}>
        <SignInPage />
      </Suspense>
    );
  }
  // Admins pass the flag, so wait for the admin check too.
  if (!globalPermissionsLoaded || isAdmin === null) return <Loader />;
  const setId = parseTourPath(window.location.pathname);
  if (!setId || !canAccessFeature('web-tours')) return <Unavailable />;
  return <Hub key={`${setId}:${user.uid}`} setId={setId} uid={user.uid} />;
};

const Hub: React.FC<{ setId: string; uid: string }> = ({ setId, uid }) => {
  const { t } = useTranslation();
  const [load, setLoad] = useState<TourLoad>({ kind: 'loading' });
  const [extension, setExtension] = useState<ExtensionStatus | null>(null);
  const [pictures, setPictures] = useState<Map<string, LoadedPicture> | null>(
    null
  );
  const [pictureUrls, setPictureUrls] = useState<Map<string, string>>(
    new Map()
  );
  const [play, setPlay] = useState<HubPlay>({ kind: 'idle' });
  const [reconnects, setReconnects] = useState(0);
  // Bumped by Start and Resume so a new port opens even after the reconnects ran out.
  const [watchEpoch, setWatchEpoch] = useState(0);
  const [startFailed, setStartFailed] = useState(false);
  // Set by an exit, so leaving the page records it while Resume can still continue the run.
  const exitAt = useRef<number | null>(null);
  const log = useRef<TourRunLog | null>(null);
  const failures = useRef(0);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const urls = new Map<string, string>();
    void loadHubTour(setId)
      .catch((err: unknown) => {
        logError('WebTourHubPage.load', err, { setId });
        return null;
      })
      .then((tour) => {
        if (cancelled) return;
        setLoad(tour ? { kind: 'ready', tour } : { kind: 'missing' });
        if (!tour) return;
        void loadPictures(setId, tour.steps).then((map) => {
          if (cancelled) return;
          map.forEach((pic, id) => {
            const blob = new Blob([pic.bytes as BlobPart], { type: pic.mime });
            urls.set(id, URL.createObjectURL(blob));
          });
          setPictures(map);
          setPictureUrls(new Map(urls));
        });
      });
    void pingExtension().then((status) => {
      if (!cancelled) setExtension(status);
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [setId]);

  const playable = extension !== null && canPlayWebTours(extension);
  const tour = load.kind === 'ready' ? load.tour : null;

  const onPortEvent = useEffectEvent((event: WebTourPortEvent) => {
    if (!tour || !eventFitsTour(event, tour.steps)) return;
    failures.current = 0;
    setPlay((prev) => reducePlay(prev, event));
    if (event.type !== 'web-tour/step' && !log.current) return;
    // Created here, not after the start reply, so the first step's clue is never lost.
    const run = (log.current ??= startTourRunLog(setId, uid, {
      v: tour.version,
      furthest: event.type === 'web-tour/step' ? event.stepIndex : 0,
      surface: 'web',
    }));
    if (event.type === 'web-tour/step') {
      exitAt.current = null;
      run.update({ furthest: event.stepIndex });
      run.match(event.stepId, event.match);
    } else if (event.type === 'web-tour/done') {
      exitAt.current = null;
      run.end({ done: true });
      log.current = null;
    } else {
      if (event.type === 'web-tour/exit') exitAt.current = event.stepIndex;
      run.flush();
    }
  });
  const onPortGone = useEffectEvent(() => {
    if (failures.current < MAX_RECONNECTS) {
      failures.current++;
      reconnectTimer.current = window.setTimeout(
        () => setReconnects((n) => n + 1),
        2000
      );
    }
  });
  useEffect(() => {
    if (!playable) return;
    const stop = watchWebTour(setId, onPortEvent, onPortGone);
    return () => {
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
      }
      stop();
    };
  }, [playable, setId, reconnects, watchEpoch]);

  useEffect(() => {
    const leave = () => {
      const run = log.current;
      if (!run) return;
      if (exitAt.current === null) run.flush();
      else run.end({ done: false, exit: exitAt.current });
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, []);

  if (load.kind === 'loading') return <Loader />;
  if (!tour) return <Unavailable />;

  const site = new URL(tour.startUrl).host;
  const resumeAt =
    play.kind === 'closed' || play.kind === 'exited' ? play.index : null;
  const furthest = 'furthest' in play ? play.furthest : -1;
  const current = play.kind === 'playing' ? play.index : null;
  const showPictures = extension !== null && !playable;

  const start = async (stepIndex: number, fresh: boolean) => {
    if (!tour || play.kind === 'starting') return;
    const previous = play;
    const url = pageUrlOf(tour.steps, stepIndex) ?? tour.startUrl;
    setPlay({ kind: 'starting' });
    setStartFailed(false);
    if (fresh && log.current) {
      log.current.end({ done: false, exit: Math.max(furthest, 0) });
      log.current = null;
    }
    exitAt.current = null;
    failures.current = 0;
    setWatchEpoch((n) => n + 1);
    const handoff = buildHandoff(
      setId,
      tour.version,
      tour.title,
      tour.steps,
      pictures ?? new Map()
    );
    const result = await startWebTour(handoff, url, stepIndex);
    if (!result.ok) {
      setStartFailed(true);
      setPlay((prev) =>
        prev.kind !== 'starting'
          ? prev
          : previous.kind === 'idle' || previous.kind === 'failed'
            ? { kind: 'failed', error: result.error }
            : previous
      );
      return;
    }
    log.current ??= startTourRunLog(setId, uid, {
      v: tour.version,
      furthest: stepIndex,
      surface: 'web',
    });
    setPlay((prev) =>
      prev.kind === 'starting'
        ? {
            kind: 'playing',
            index: stepIndex,
            furthest: fresh ? stepIndex : Math.max(furthest, stepIndex),
            matches: !fresh && 'matches' in previous ? previous.matches : {},
          }
        : prev
    );
  };

  return (
    <main className="h-screen [height:100dvh] overflow-y-auto bg-white px-4 py-10 pb-16">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('webTourHub.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {tour.title || t('webTourHub.untitled')}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t('webTourHub.summary', { site, count: tour.steps.length })}
        </p>

        <div className="mt-6 border-t border-slate-200 pt-4" aria-live="polite">
          {extension === null ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              {t('webTourHub.checking')}
            </p>
          ) : playable ? (
            <PlayControls
              play={play}
              resumeAt={resumeAt}
              picturesReady={pictures !== null}
              startFailed={startFailed}
              onStart={(index, fresh) => void start(index, fresh)}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                {extension.kind === 'ready' && extension.profile === 'other'
                  ? t('webTourHub.wrongProfile')
                  : extension.kind === 'ready' && extension.profile === 'staff'
                    ? t('webTourHub.oldExtension')
                    : t('webTourHub.noExtension')}
              </p>
              <a
                href={tour.startUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue-primary hover:underline"
              >
                {t('webTourHub.openSite', { site })}
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        <ol className="mt-6 divide-y divide-slate-200 border-t border-slate-200">
          {tour.steps.map((step, i) => {
            const done = play.kind === 'done' || i < furthest;
            const isCurrent = current === i;
            const url = pictureUrls.get(step.id);
            return (
              <li
                key={step.id}
                aria-current={isCurrent ? 'step' : undefined}
                className="flex gap-3 py-3"
              >
                <span className="mt-0.5 w-6 shrink-0 text-sm font-semibold text-slate-500">
                  {done ? (
                    <CheckCircle2
                      className="w-4 h-4 text-emerald-600"
                      aria-label={t('webTourHub.stepDone')}
                    />
                  ) : (
                    `${i + 1}.`
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm ${isCurrent ? 'font-semibold text-slate-900' : 'text-slate-800'}`}
                  >
                    {step.label?.trim()
                      ? step.label
                      : t('webTourHub.untitledStep')}
                    {isCurrent && (
                      <span className="ml-2 text-xs font-semibold text-brand-blue-primary">
                        {t('webTourHub.currentStep')}
                      </span>
                    )}
                  </p>
                  {step.text?.trim() && (
                    <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">
                      {step.text}
                    </p>
                  )}
                  {showPictures && url && (
                    <img
                      src={url}
                      alt={t('webTourHub.pictureAlt', { number: i + 1 })}
                      width={step.web.picture?.w}
                      height={step.web.picture?.h}
                      className="mt-2 h-auto max-w-full rounded border border-slate-200"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </main>
  );
};

const PlayControls: React.FC<{
  play: HubPlay;
  resumeAt: number | null;
  picturesReady: boolean;
  startFailed: boolean;
  onStart: (index: number, fresh: boolean) => void;
}> = ({ play, resumeAt, picturesReady, startFailed, onStart }) => {
  const { t } = useTranslation();
  const button =
    'inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-50';
  if (play.kind === 'playing') {
    return <p className="text-sm text-slate-700">{t('webTourHub.playing')}</p>;
  }
  const status = startFailed
    ? t('webTourHub.startFailed')
    : play.kind === 'closed'
      ? t('webTourHub.closed')
      : play.kind === 'exited'
        ? t('webTourHub.exited')
        : play.kind === 'done'
          ? t('webTourHub.done')
          : null;
  return (
    <div className="space-y-3">
      {status && <p className="text-sm text-slate-700">{status}</p>}
      <div className="flex flex-wrap gap-2">
        {resumeAt !== null && (
          // no-tour-anchor: the tour page runs outside the board, where live tours can't run
          <button
            type="button"
            onClick={() => onStart(resumeAt, false)}
            className={button}
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            {t('webTourHub.resume', { number: resumeAt + 1 })}
          </button>
        )}
        {/* no-tour-anchor: the tour page runs outside the board, where live tours can't run */}
        <button
          type="button"
          disabled={play.kind === 'starting' || !picturesReady}
          onClick={() =>
            onStart(0, play.kind !== 'idle' && play.kind !== 'failed')
          }
          className={
            resumeAt !== null
              ? 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
              : button
          }
        >
          {play.kind === 'starting' ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="w-4 h-4" aria-hidden="true" />
          )}
          {play.kind === 'idle' ||
          play.kind === 'starting' ||
          play.kind === 'failed'
            ? t('webTourHub.start')
            : t('webTourHub.startOver')}
        </button>
      </div>
    </div>
  );
};

export default WebTourHubPage;

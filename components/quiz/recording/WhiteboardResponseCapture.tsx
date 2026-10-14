import React, {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  Hourglass,
  Loader2,
  MicOff,
  PenLine,
  RotateCcw,
  Square,
} from 'lucide-react';
import type {
  RecordingConfig,
  ResponseArtifact,
  WhiteboardStartingPage,
} from '@/types';
import { startingPageId } from '@/utils/whiteboard/startingPage';
import {
  useWhiteboardRecording,
  toCapturedTake,
  type WhiteboardCapturedTake,
  type WhiteboardTake,
  type WhiteboardRecordingDeps,
} from '@/hooks/useWhiteboardRecording';
import {
  recordingReviewEnabled,
  takesRemaining,
} from '@/config/quizRecordingDefaults';
import {
  WhiteboardCanvas,
  type WhiteboardCanvasHandle,
} from '@/components/quiz/whiteboard/WhiteboardCanvas';
import { renderWhiteboardPicture } from '@/components/quiz/whiteboard/whiteboardPicture';
import { useStartingPageImage } from '@/components/quiz/whiteboard/useStartingPageImage';
import { WhiteboardReplayView } from '@/components/quiz/whiteboard/WhiteboardReplayView';
import {
  createWhiteboardLogRecorder,
  replayAt,
  serializeWhiteboardLog,
  type WhiteboardLog,
  type WhiteboardLogRecorder,
} from '@/components/quiz/whiteboard/whiteboardLog';
import { registerActiveTake } from './activeTake';
import {
  RecordingConsentNotice,
  RecordingNoticeReminder,
} from './RecordingConsentNotice';
import { NoticeReminderOverlay } from './NoticeReminderOverlay';
import { formatClock } from './formatClock';
import {
  hasRecoverableContent,
  type RecoveredTake,
  type TakeRecoveryStore,
} from '@/utils/takeRecoveryStore';
import type { CommitState } from './AudioResponseCapture';
import { useRedoCount } from './useRedoCount';

export interface WhiteboardResponseCaptureProps {
  config: RecordingConfig;
  takesCommitted: number;
  noticeAckedAt: number | null;
  onAcknowledgeNotice: () => void;
  /** False when an admin turned the recording notice off. */
  noticeRequired?: boolean;
  /** Resolves once the take is written; rejects to surface the failed state. */
  onCommit: (take: WhiteboardTake) => Promise<void>;
  onRetryUpload?: () => Promise<void>;
  onPrepExpired?: (expiry: RecordingConfig['prepExpiry']) => void;
  /** Every artifact of the latest committed take; the worst upload state shows. */
  latestArtifacts?: ResponseArtifact[];
  slotClosed?: boolean;
  /** Local crash-recovery mirror (D17), keyed per question. */
  recovery?: { store: TakeRecoveryStore; key: string };
  /** Injected by tests and the DEV harness only. */
  recorderDeps?: WhiteboardRecordingDeps;
  commitStateOverride?: CommitState;
}

const BLANK_PAGE: WhiteboardStartingPage = { pattern: { kind: 'blank' } };

const REPLAY_WIDTH: React.CSSProperties = {
  width: 'calc((100cqh - 5rem) * 4 / 3)',
  maxWidth: '100%',
};

/** How often the drawing log is re-mirrored while a take runs. */
const LOG_MIRROR_MS = 2_000;

const btn =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

export const WhiteboardResponseCapture: React.FC<
  WhiteboardResponseCaptureProps
> = ({
  config,
  takesCommitted,
  noticeAckedAt,
  onAcknowledgeNotice,
  noticeRequired = true,
  onCommit,
  onRetryUpload,
  onPrepExpired,
  latestArtifacts,
  slotClosed = false,
  recovery,
  recorderDeps,
  commitStateOverride,
}) => {
  const { t } = useTranslation();
  const startingPage = config.startingPage ?? BLANK_PAGE;
  const [showNotice, setShowNotice] = useState(false);
  const [localCommitState, setCommitState] = useState<CommitState>('idle');
  const commitState = commitStateOverride ?? localCommitState;
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [takeKey, setTakeKey] = useState(0);
  const makeLogRecorder = useCallback(
    (): WhiteboardLogRecorder =>
      createWhiteboardLogRecorder({
        startingPageId: startingPageId(startingPage),
        // One clock for ink and audio: the hook stamps t0 with the same now().
        now: recorderDeps?.now ?? (() => performance.now()),
      }),
    [recorderDeps, startingPage]
  );
  const [logRecorder, setLogRecorder] =
    useState<WhiteboardLogRecorder>(makeLogRecorder);

  const {
    image: startingImage,
    ready: startingPageReady,
    failed: startingPageFailed,
    retry: retryStartingPage,
  } = useStartingPageImage(startingPage);
  const acknowledged = !noticeRequired || noticeAckedAt !== null;
  // Every recording is an attempt; a redo throws the last one away (Paul 2026-10-14).
  const [redos, addRedo] = useRedoCount(recovery?.key, takesCommitted);
  const attemptsUsed = takesCommitted + redos;
  const remaining = takesRemaining(config, attemptsUsed);
  const takeBudgetReached = remaining !== null && remaining <= 0;
  const canRedoInReview = remaining === null || remaining > 1;
  const [submitted, setSubmitted] = useState<{
    log: WhiteboardLog;
    pictureUrl: string;
    audioUrl: string | null;
    durationMs: number;
  } | null>(null);
  const submittedUrlsRef = useRef<string[]>([]);
  const keepSubmitted = useCallback(
    (captured: WhiteboardCapturedTake, picture: Blob) => {
      submittedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      const pictureUrl = URL.createObjectURL(picture);
      const audioUrl = captured.audio
        ? URL.createObjectURL(captured.audio.blob)
        : null;
      submittedUrlsRef.current = audioUrl
        ? [pictureUrl, audioUrl]
        : [pictureUrl];
      setSubmitted({
        log: captured.log,
        pictureUrl,
        audioUrl,
        durationMs: captured.durationMs,
      });
    },
    []
  );
  useEffect(
    () => () => submittedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u)),
    []
  );
  const reviewOn = recordingReviewEnabled(config);

  const pictureRef = useRef<{ url: string; blob: Blob } | null>(null);
  const boardGenRef = useRef(0);
  const reminderRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<WhiteboardCanvasHandle>(null);
  const retryBtnRef = useRef<HTMLButtonElement>(null);
  const statusBannerRef = useRef<HTMLDivElement>(null);
  const focusAfterRetryRef = useRef<'retry' | 'banner' | null>(null);
  const finishTakeRef = useRef<() => void>(() => undefined);
  const restoreRef = useRef<(take: WhiteboardCapturedTake) => void>(
    () => undefined
  );

  const recoveryRef = useRef(recovery);
  const onCommitRef = useRef(onCommit);
  const reviewOnRef = useRef(reviewOn);
  useLayoutEffect(() => {
    recoveryRef.current = recovery;
    onCommitRef.current = onCommit;
    reviewOnRef.current = reviewOn;
  });

  // Recovery writes run in order, so a late chunk never lands after a wipe.
  const recoveryWritesRef = useRef<Promise<void>>(Promise.resolve());
  const queueRecovery = useCallback(
    (op: (store: TakeRecoveryStore, key: string) => Promise<void>) => {
      const r = recoveryRef.current;
      if (!r) return;
      recoveryWritesRef.current = recoveryWritesRef.current
        .then(() => op(r.store, r.key))
        .catch(() => undefined);
    },
    []
  );
  const saveLog = useCallback(
    (log: WhiteboardLog) =>
      queueRecovery((store, key) =>
        store.setLog(key, serializeWhiteboardLog(log), Date.now())
      ),
    [queueRecovery]
  );
  const wipeRecovery = useCallback(
    () => queueRecovery((store, key) => store.remove(key)),
    [queueRecovery]
  );

  const setPicture = useCallback((blob: Blob | null) => {
    if (pictureRef.current) URL.revokeObjectURL(pictureRef.current.url);
    pictureRef.current = blob ? { url: URL.createObjectURL(blob), blob } : null;
    setPictureUrl(pictureRef.current?.url ?? null);
  }, []);

  const renderPicture = useCallback(
    async (captured: WhiteboardCapturedTake): Promise<Blob> => {
      if (pictureRef.current) return pictureRef.current.blob;
      const gen = boardGenRef.current;
      const objects = replayAt(captured.log, captured.durationMs);
      const blob = await renderWhiteboardPicture(
        objects,
        startingPage,
        startingImage
      );
      // A take discarded mid-render must not leave its picture for the next one.
      if (gen === boardGenRef.current) setPicture(blob);
      return blob;
    },
    [setPicture, startingImage, startingPage]
  );

  // Commits the take in hand; nothing reaches the network before this.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const commitTake = useCallback(
    (captured: WhiteboardCapturedTake): Promise<void> => {
      if (inFlightRef.current) return inFlightRef.current;
      setCommitState('committing');
      const run = (async () => {
        try {
          const picture = await renderPicture(captured);
          // The local copy outlives the render, so a crash before hand-off can recover it.
          wipeRecovery();
          await onCommitRef.current({
            audio: captured.audio,
            picture,
            log: new Blob([serializeWhiteboardLog(captured.log)], {
              type: 'application/json',
            }),
            durationMs: captured.durationMs,
            micState: captured.micState,
          });
          keepSubmitted(captured, picture);
          setCommitState('idle');
        } catch {
          setCommitState('archive-failed');
        }
      })().then(() => {
        inFlightRef.current = null;
        // Like spoken takes, a failed send re-arms; the banner offers the retry.
        finishTakeRef.current();
      });
      inFlightRef.current = run;
      return run;
    },
    [keepSubmitted, renderPicture, wipeRecovery]
  );

  const handleTakeReady = useCallback(
    (captured: WhiteboardCapturedTake) => {
      saveLog(captured.log);
      if (!reviewOnRef.current) {
        // D5: with review off, the take commits the moment it ends.
        void commitTake(captured);
        return;
      }
      void renderPicture(captured);
    },
    [commitTake, renderPicture, saveLog]
  );

  // A fresh page and a fresh log for every take (D13).
  const resetBoard = useCallback(() => {
    boardGenRef.current += 1;
    setPicture(null);
    setLogRecorder(makeLogRecorder());
    setTakeKey((k) => k + 1);
  }, [makeLogRecorder, setPicture]);

  const recorder = useWhiteboardRecording({
    config,
    enabled:
      acknowledged && !takeBudgetReached && !slotClosed && startingPageReady,
    logSink: logRecorder,
    onPrepExpired,
    onTakeReady: handleTakeReady,
    onBeforeStop: () => canvasRef.current?.flush(),
    onStarted: ({ mimeType, micState }) => {
      const at = Date.now();
      queueRecovery((store, key) =>
        store.begin(key, mimeType, at, { micState })
      );
    },
    onAudioChunk: (chunk) => {
      const at = Date.now();
      queueRecovery((store, key) => store.appendChunk(key, chunk, at));
    },
    deps: recorderDeps,
  });
  const { phase } = recorder;

  useLayoutEffect(() => {
    finishTakeRef.current = () => {
      recorder.commit();
      resetBoard();
    };
    restoreRef.current = recorder.restore;
  });

  const handleStart = useCallback(async () => {
    await recorder.start();
  }, [recorder]);

  // Mirror the log while the take runs; audio chunks stream on their own (D17).
  useEffect(() => {
    if (phase !== 'recording' || !recovery) return;
    const id = window.setInterval(
      () => saveLog(logRecorder.toLog()),
      LOG_MIRROR_MS
    );
    return () => clearInterval(id);
  }, [logRecorder, phase, recovery, saveLog]);

  // A take left behind by a crash or reload opens in review, or commits (D17).
  const applyRecovered = useEffectEvent((found: RecoveredTake | null) => {
    if (!found || !hasRecoverableContent(found)) return;
    const recovered = toCapturedTake(found);
    if (!recovered) return;
    restoreRef.current(recovered);
    if (!reviewOnRef.current) void commitTake(recovered);
    else void renderPicture(recovered);
  });
  const restoredRef = useRef(false);
  const hasRecovery = !!recovery;
  useEffect(() => {
    const r = recoveryRef.current;
    if (restoredRef.current || !r || !acknowledged) return;
    restoredRef.current = true;
    void r.store.load(r.key, Date.now()).then(applyRecovered);
  }, [acknowledged, hasRecovery]);

  // D16: a tab-away or time-limit cutoff commits the take as captured first.
  const liveTake =
    phase === 'recording' || phase === 'stopping' || phase === 'reviewing';
  const stopRef = useRef(recorder.stop);
  const takeRef = useRef(recorder.take);
  useLayoutEffect(() => {
    stopRef.current = recorder.stop;
    takeRef.current = recorder.take;
  });
  useEffect(() => {
    if (!liveTake) return;
    return registerActiveTake({
      commitNow: async () => {
        const captured = takeRef.current ?? (await stopRef.current('cutoff'));
        if (!captured) return;
        await commitTake(captured);
      },
    });
  }, [commitTake, liveTake]);

  useEffect(() => {
    return () => {
      if (pictureRef.current) URL.revokeObjectURL(pictureRef.current.url);
    };
  }, []);

  const handleCommit = useCallback(async () => {
    const captured = recorder.take;
    if (!captured) return;
    await commitTake(captured);
  }, [commitTake, recorder.take]);

  const handleRedo = useCallback(() => {
    addRedo();
    recorder.discard();
    wipeRecovery();
    resetBoard();
  }, [addRedo, recorder, resetBoard, wipeRecovery]);

  useEffect(() => {
    const target = focusAfterRetryRef.current;
    if (!target) return;
    focusAfterRetryRef.current = null;
    (target === 'retry' ? retryBtnRef : statusBannerRef).current?.focus();
  }, [commitState]);

  const handleRetryUpload = useCallback(async () => {
    if (!onRetryUpload) return;
    setCommitState('retrying');
    try {
      await onRetryUpload();
      focusAfterRetryRef.current = 'banner';
      setCommitState('idle');
    } catch {
      focusAfterRetryRef.current = 'retry';
      setCommitState('archive-failed');
    }
  }, [onRetryUpload]);

  if (slotClosed) {
    return (
      <section
        className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"
          >
            <Hourglass className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {t('quizMediaResponse.capture.windowClosedTitle')}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">
              {t('quizMediaResponse.whiteboard.windowClosedBody')}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!acknowledged) {
    return <RecordingConsentNotice light onAcknowledge={onAcknowledgeNotice} />;
  }

  const takeLabel =
    config.takeLimit == null
      ? t('quizMediaResponse.capture.takeUnlimited', { n: attemptsUsed + 1 })
      : t('quizMediaResponse.capture.takeOf', {
          n: Math.min(attemptsUsed + 1, config.takeLimit),
          total: config.takeLimit,
        });

  const archivePending =
    (!!latestArtifacts?.some((a) => a.uploadState === 'pending') &&
      commitState !== 'archive-failed') ||
    commitState === 'committing' ||
    commitState === 'retrying';
  const archiveFailed =
    !archivePending &&
    (!!latestArtifacts?.some((a) => a.uploadState === 'failed') ||
      commitState === 'archive-failed');

  const recording = phase === 'recording';
  const reviewing = phase === 'reviewing' && recorder.take !== null;
  const canDraw = recording;
  // After turning in, the board shows what was sent until a redo starts.
  const showSubmitted = takesCommitted > 0 && phase === 'armed';
  const micOff =
    recorder.narrated &&
    (recorder.micState === 'denied' || recorder.micState === 'unavailable');

  return (
    <>
      <section
        className="flex flex-1 flex-col gap-3 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm"
        data-testid="whiteboard-capture"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-blue-primary/10 text-brand-blue-primary"
            >
              <PenLine className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">
                {t('quizMediaResponse.whiteboard.title')}
              </p>
              <p className="text-xs text-slate-600">
                {takeLabel} ·{' '}
                {t('quizMediaResponse.capture.limitHint', {
                  seconds: config.limitSeconds,
                })}
              </p>
            </div>
          </div>

          <div
            className="ml-auto flex items-center gap-3"
            role="status"
            aria-live="polite"
          >
            {showSubmitted && (
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-emerald-700">
                <Check aria-hidden className="h-3.5 w-3.5" />
                {t('quizMediaResponse.capture.submittedLabel')}
              </p>
            )}
            {phase === 'prep' && (
              <p className="flex items-baseline gap-2 text-sm text-slate-600">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  {t('quizMediaResponse.capture.prepLabel')}
                </span>
                <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">
                  {formatClock(recorder.prepSecondsLeft ?? config.prepSeconds)}
                </span>
              </p>
            )}
            {phase === 'requesting-permission' && (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                {t('quizMediaResponse.capture.requestingMic')}
              </p>
            )}
            {(recording || phase === 'stopping') && (
              <p
                className={`flex items-center gap-2 text-sm font-semibold ${
                  recorder.wrapUpWarning ? 'text-red-700' : 'text-slate-700'
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-full bg-red-600 ring-4 ring-red-600/20"
                />
                <span className="text-xs font-bold uppercase tracking-widest text-red-600">
                  {t('quizMediaResponse.capture.recordingLabel')}
                </span>
                <span
                  className="font-mono text-2xl font-bold tabular-nums text-slate-900"
                  aria-live="off"
                >
                  {formatClock(
                    recorder.recordSecondsLeft ?? config.limitSeconds
                  )}
                </span>
                {recorder.wrapUpWarning && (
                  <span>
                    {t('quizMediaResponse.capture.wrapUp', {
                      seconds: config.limitSeconds,
                    })}
                  </span>
                )}
              </p>
            )}
          </div>
          {noticeRequired && (
            <RecordingNoticeReminder
              ref={reminderRef}
              light
              disabled={recording}
              onOpen={() => setShowNotice(true)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {phase === 'armed' && !takeBudgetReached && startingPageReady && (
              <button
                // no-tour-anchor: student quiz app, outside teacher tours
                type="button"
                onClick={() => void handleStart()}
                className={`${btn} bg-brand-red-primary text-white outline-brand-red-primary hover:bg-brand-red-dark`}
              >
                {takesCommitted > 0 ? (
                  <RotateCcw aria-hidden className="h-4 w-4" />
                ) : (
                  <PenLine aria-hidden className="h-4 w-4" />
                )}
                {takesCommitted > 0
                  ? t('quizMediaResponse.capture.redo')
                  : t('quizMediaResponse.capture.record')}
              </button>
            )}
            {recording && (
              <button
                // no-tour-anchor: student quiz app, outside teacher tours
                type="button"
                onClick={() => void recorder.stop('user')}
                className={`${btn} bg-slate-900 text-white outline-slate-900 hover:bg-slate-800`}
              >
                <Square aria-hidden className="h-4 w-4" />
                {reviewOn
                  ? t('quizMediaResponse.capture.stop')
                  : t('quizMediaResponse.capture.stopAndSubmit')}
              </button>
            )}
            {reviewing && reviewOn && (
              <>
                {canRedoInReview && (
                  <button
                    // no-tour-anchor: student quiz app, outside teacher tours
                    type="button"
                    onClick={handleRedo}
                    disabled={commitState === 'committing'}
                    className={`${btn} border border-slate-300 bg-white text-slate-700 outline-slate-400 hover:bg-slate-50`}
                  >
                    <RotateCcw aria-hidden className="h-4 w-4" />
                    {t('quizMediaResponse.capture.redo')}
                  </button>
                )}
                <button
                  // no-tour-anchor: student quiz app, outside teacher tours
                  type="button"
                  onClick={() => void handleCommit()}
                  disabled={commitState === 'committing'}
                  className={`${btn} bg-brand-blue-primary text-white outline-brand-blue-primary hover:bg-brand-blue-dark`}
                >
                  {commitState === 'committing' ? (
                    <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check aria-hidden className="h-4 w-4" />
                  )}
                  {t('quizMediaResponse.capture.commit')}
                </button>
              </>
            )}
          </div>
        </div>

        {micOff && (recording || reviewing) && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <MicOff aria-hidden className="h-4 w-4 shrink-0" />
            {t('quizMediaResponse.whiteboard.micOff')}
          </p>
        )}

        {reviewing && reviewOn && recorder.take?.stopReason === 'budget' && (
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {t('quizMediaResponse.whiteboard.boardFull')}
          </p>
        )}

        {/* The board takes the height left over, so the page never scrolls. */}
        <div className="relative min-h-[16rem] w-full flex-1 [container-type:size]">
          <div className="absolute inset-0">
            {reviewing && reviewOn && recorder.take ? (
              // Width leaves room under the 4:3 picture for the replay controls.
              <div className="mx-auto" style={REPLAY_WIDTH}>
                <WhiteboardReplayView
                  log={recorder.take.log}
                  pictureUrl={pictureUrl}
                  loading={!pictureUrl}
                  audioSrc={recorder.audioUrl ?? undefined}
                  durationMs={recorder.take.durationMs}
                  startingPage={startingPage}
                />
              </div>
            ) : showSubmitted && submitted ? (
              <div className="mx-auto" style={REPLAY_WIDTH}>
                <WhiteboardReplayView
                  log={submitted.log}
                  pictureUrl={submitted.pictureUrl}
                  loading={false}
                  audioSrc={submitted.audioUrl ?? undefined}
                  durationMs={submitted.durationMs}
                  startingPage={startingPage}
                />
              </div>
            ) : (
              <WhiteboardCanvas
                ref={canvasRef}
                key={takeKey}
                startingPage={startingPage}
                startingImage={startingImage}
                disabled={!canDraw}
                recorder={logRecorder}
              />
            )}
            {startingPageFailed && !recording && !reviewing && (
              <div
                role="alert"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90"
              >
                <p className="text-sm font-semibold text-slate-800">
                  {t('quizWhiteboard.startingPage.loadFailed')}
                </p>
                <button
                  // no-tour-anchor: student quiz app, outside teacher tours
                  type="button"
                  onClick={retryStartingPage}
                  className={`${btn} bg-brand-blue-primary text-white outline-brand-blue-primary hover:bg-brand-blue-dark`}
                >
                  <RotateCcw aria-hidden className="h-4 w-4" />
                  {t('quizMediaResponse.capture.retryUpload')}
                </button>
              </div>
            )}
            {!startingPageFailed &&
              !recording &&
              !reviewing &&
              !(showSubmitted && (submitted !== null || takeBudgetReached)) &&
              phase !== 'stopping' && (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                  <p className="rounded-xl bg-slate-900/80 px-4 py-2 text-sm font-semibold text-white">
                    {takeBudgetReached
                      ? t('quizMediaResponse.capture.submittedLabel')
                      : phase === 'prep'
                        ? t('quizMediaResponse.capture.prepBody')
                        : recorder.narrated
                          ? t('quizMediaResponse.whiteboard.armedNarrated')
                          : t('quizMediaResponse.whiteboard.armedDrawOnly')}
                  </p>
                </div>
              )}
          </div>
        </div>
        {(archivePending || archiveFailed) && (
          <div
            ref={statusBannerRef}
            tabIndex={-1}
            className={`rounded-2xl p-3 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-slate-400 ${
              archiveFailed
                ? 'bg-amber-50 text-amber-800'
                : 'bg-slate-100 text-slate-700'
            }`}
            role="status"
            aria-live="polite"
          >
            <p className="flex items-start gap-2">
              {archiveFailed ? (
                <AlertTriangle
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
              ) : (
                <Loader2
                  aria-hidden
                  className="mt-0.5 h-4 w-4 shrink-0 animate-spin"
                />
              )}
              {archiveFailed
                ? onRetryUpload
                  ? t('quizMediaResponse.whiteboard.notSubmittedFailed')
                  : t('quizMediaResponse.whiteboard.notSubmittedFailedFinal')
                : t('quizMediaResponse.whiteboard.notSubmittedPending')}
            </p>
            {archiveFailed && onRetryUpload && (
              <button
                // no-tour-anchor: student quiz app, outside teacher tours
                ref={retryBtnRef}
                type="button"
                onClick={() => void handleRetryUpload()}
                className={`${btn} mt-3 border border-amber-300 bg-white text-amber-900 outline-amber-500 hover:bg-amber-100`}
              >
                <RotateCcw aria-hidden className="h-4 w-4" />
                {t('quizMediaResponse.capture.retryUpload')}
              </button>
            )}
          </div>
        )}
      </section>
      {showNotice && (
        <NoticeReminderOverlay
          light
          onClose={() => {
            setShowNotice(false);
            reminderRef.current?.focus();
          }}
        />
      )}
    </>
  );
};

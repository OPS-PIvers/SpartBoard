import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  Hourglass,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import type { RecordingConfig, ResponseArtifact } from '@/types';
import {
  useAudioRecording,
  type AudioRecordingDeps,
  type AudioTake,
} from '@/hooks/useAudioRecording';
import { takesRemaining } from '@/config/quizRecordingDefaults';
import {
  RecordingConsentNotice,
  RecordingNoticeReminder,
} from './RecordingConsentNotice';
import { TakeReviewPlayer } from './TakeReviewPlayer';
import { formatClock } from './formatClock';

export type CommitState = 'idle' | 'committing' | 'retrying' | 'archive-failed';

export interface AudioResponseCaptureProps {
  config: RecordingConfig;
  /** Committed takes already on the response for this question. */
  takesCommitted: number;
  /** Notice acknowledgment for this assignment; null until the student acks. */
  noticeAckedAt: number | null;
  onAcknowledgeNotice: () => void;
  /** Resolves once the take is written; rejects to surface the failed state. */
  onCommit: (take: AudioTake) => Promise<void>;
  /** Re-sends the failed take's own artifact; absent when the bytes are gone. */
  onRetryUpload?: () => Promise<void>;
  onPrepExpired?: (expiry: RecordingConfig['prepExpiry']) => void;
  onCaptureUnavailable?: () => void;
  /** Archive state of the most recent committed take, for "not yet submitted". */
  latestArtifact?: ResponseArtifact;
  /** Prep expiry already closed this slot; the recorder must stay locked. */
  slotClosed?: boolean;
  /** Injected by tests and the DEV harness only. */
  recorderDeps?: AudioRecordingDeps;
  /** Forced state for the DEV harness; never set in the app. */
  commitStateOverride?: CommitState;
}

const cardCls =
  'rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm';
const primaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The reminder layers ABOVE the live recorder; capture never unmounts. */
const NoticeReminderOverlay: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const focusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    focusable()[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (!active || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!active || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recording-notice-heading"
        className="max-h-full w-full max-w-lg overflow-y-auto"
      >
        <RecordingConsentNotice variant="reminder" onAcknowledge={onClose} />
      </div>
    </div>
  );
};

export const AudioResponseCapture: React.FC<AudioResponseCaptureProps> = ({
  config,
  takesCommitted,
  noticeAckedAt,
  onAcknowledgeNotice,
  onCommit,
  onRetryUpload,
  onPrepExpired,
  onCaptureUnavailable,
  latestArtifact,
  slotClosed = false,
  recorderDeps,
  commitStateOverride,
}) => {
  const { t } = useTranslation();
  const [showNotice, setShowNotice] = useState(false);
  const [localCommitState, setCommitState] = useState<CommitState>('idle');
  const commitState = commitStateOverride ?? localCommitState;

  const acknowledged = noticeAckedAt !== null;
  const remaining = takesRemaining(config, takesCommitted);
  const takeBudgetReached = remaining !== null && remaining <= 0;

  const recorder = useAudioRecording({
    config,
    enabled: acknowledged && !takeBudgetReached && !slotClosed,
    onPrepExpired,
    onCaptureUnavailable,
    deps: recorderDeps,
  });

  const { phase, commit } = recorder;

  const handleCommit = useCallback(async () => {
    const take = commit();
    if (!take) return;
    setCommitState('committing');
    try {
      await onCommit(take);
      setCommitState('idle');
    } catch {
      setCommitState('archive-failed');
    }
  }, [commit, onCommit]);

  const retryBtnRef = useRef<HTMLButtonElement>(null);
  const statusBannerRef = useRef<HTMLDivElement>(null);
  const reminderRef = useRef<HTMLButtonElement>(null);
  const focusAfterRetryRef = useRef<'retry' | 'banner' | null>(null);

  // "Try again" unmounts itself; focus must not fall to <body>.
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

  const takeLabel = useMemo(() => {
    if (config.takeLimit == null)
      return t('quizMediaResponse.capture.takeUnlimited', {
        n: takesCommitted + 1,
      });
    return t('quizMediaResponse.capture.takeOf', {
      n: Math.min(takesCommitted + 1, config.takeLimit),
      total: config.takeLimit,
    });
  }, [config.takeLimit, t, takesCommitted]);

  // A closed slot outranks everything: no notice, no mic, no controls.
  if (slotClosed) {
    return (
      <section className={cardCls} aria-live="polite">
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
              {t('quizMediaResponse.capture.windowClosedBody')}
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Tennessen notice comes first — the mic is never probed before it.
  if (!acknowledged) {
    return <RecordingConsentNotice onAcknowledge={onAcknowledgeNotice} />;
  }

  if (phase === 'capture-unavailable') {
    return (
      <section className={cardCls} aria-live="polite">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"
          >
            <MicOff className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {t('quizMediaResponse.unavailable.title')}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">
              {t('quizMediaResponse.unavailable.body')}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const archivePending =
    (latestArtifact?.uploadState === 'pending' &&
      commitState !== 'archive-failed') ||
    commitState === 'committing' ||
    commitState === 'retrying';
  const archiveFailed =
    !archivePending &&
    (latestArtifact?.uploadState === 'failed' ||
      commitState === 'archive-failed');

  return (
    <>
      <section className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-blue-primary/10 text-brand-blue-primary"
            >
              <Mic className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">
                {t('quizMediaResponse.capture.title')}
              </p>
              <p className="text-xs text-slate-600">
                {takeLabel} ·{' '}
                {t('quizMediaResponse.capture.limitHint', {
                  seconds: config.limitSeconds,
                })}
              </p>
            </div>
          </div>
          <RecordingNoticeReminder
            ref={reminderRef}
            disabled={phase === 'recording'}
            onOpen={() => setShowNotice(true)}
          />
        </div>

        <div className="mt-5">
          {phase === 'prep' && (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 py-8">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {t('quizMediaResponse.capture.prepLabel')}
              </p>
              <p
                className="font-mono text-4xl font-bold tabular-nums text-slate-900"
                aria-live="off"
              >
                {formatClock(recorder.prepSecondsLeft ?? config.prepSeconds)}
              </p>
              <p className="max-w-sm text-center text-sm text-slate-600">
                {t('quizMediaResponse.capture.prepBody')}
              </p>
            </div>
          )}

          {phase === 'requesting-permission' && (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 py-8">
              <Loader2
                aria-hidden
                className="h-6 w-6 animate-spin text-slate-500"
              />
              <p className="text-sm text-slate-600">
                {t('quizMediaResponse.capture.requestingMic')}
              </p>
            </div>
          )}

          {phase === 'recording' && (
            <div
              className={`flex flex-col items-center gap-2 rounded-2xl py-8 ${
                recorder.wrapUpWarning ? 'bg-red-50' : 'bg-slate-50'
              }`}
              role="status"
              aria-live="polite"
            >
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-600">
                {/* Static dot, not a pulse: unmistakable without looping motion. */}
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-full bg-red-600 ring-4 ring-red-600/20"
                />
                {t('quizMediaResponse.capture.recordingLabel')}
              </p>
              <p
                className="font-mono text-5xl font-bold tabular-nums text-slate-900"
                aria-live="off"
              >
                {formatClock(recorder.recordSecondsLeft ?? config.limitSeconds)}
              </p>
              <p className="text-sm font-semibold text-red-700">
                {recorder.wrapUpWarning
                  ? t('quizMediaResponse.capture.wrapUp', {
                      seconds: config.limitSeconds,
                    })
                  : t('quizMediaResponse.capture.recordingHint', {
                      seconds: config.limitSeconds,
                    })}
              </p>
            </div>
          )}

          {phase === 'reviewing' && recorder.takeUrl && (
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {t('quizMediaResponse.capture.reviewLabel')}
              </p>
              {/* Local object URL — reviewing touches no network and no Firestore. */}
              <TakeReviewPlayer
                key={recorder.takeUrl}
                src={recorder.takeUrl}
                durationMs={recorder.take?.durationMs ?? 0}
              />
              <p className="mt-2 text-sm text-slate-600">
                {t('quizMediaResponse.capture.reviewBody')}
              </p>
            </div>
          )}

          {phase === 'armed' && !takeBudgetReached && (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 py-8">
              <p className="text-sm text-slate-600">
                {t('quizMediaResponse.capture.armedBody', {
                  seconds: config.limitSeconds,
                })}
              </p>
            </div>
          )}

          {takeBudgetReached && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {t('quizMediaResponse.capture.takeLimitReachedTitle')}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {t('quizMediaResponse.capture.takeLimitReachedBody', {
                  total: config.takeLimit ?? 0,
                })}
              </p>
            </div>
          )}
        </div>

        {(archivePending || archiveFailed) && (
          <div
            ref={statusBannerRef}
            tabIndex={-1}
            className={`mt-4 rounded-2xl p-3 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-slate-400 ${
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
                  ? t('quizMediaResponse.capture.notSubmittedFailed')
                  : t('quizMediaResponse.capture.notSubmittedFailedFinal')
                : t('quizMediaResponse.capture.notSubmittedPending')}
            </p>
            {archiveFailed && onRetryUpload && (
              <button
                ref={retryBtnRef}
                type="button"
                onClick={() => void handleRetryUpload()}
                className={`${primaryBtn} mt-3 border border-amber-300 bg-white text-amber-900 outline-amber-500 hover:bg-amber-100`}
              >
                <RotateCcw aria-hidden className="h-4 w-4" />
                {t('quizMediaResponse.capture.retryUpload')}
              </button>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {phase === 'armed' && !takeBudgetReached && (
            <button
              type="button"
              onClick={() => void recorder.start()}
              className={`${primaryBtn} bg-brand-red-primary text-white outline-brand-red-primary hover:bg-brand-red-dark`}
            >
              <Mic aria-hidden className="h-4 w-4" />
              {takesCommitted > 0
                ? t('quizMediaResponse.capture.recordAgain')
                : t('quizMediaResponse.capture.record')}
            </button>
          )}

          {phase === 'recording' && (
            <button
              type="button"
              onClick={recorder.stop}
              className={`${primaryBtn} bg-slate-900 text-white outline-slate-900 hover:bg-slate-800`}
            >
              <Square aria-hidden className="h-4 w-4" />
              {t('quizMediaResponse.capture.stop')}
            </button>
          )}

          {phase === 'reviewing' && (
            <>
              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={commitState === 'committing'}
                className={`${primaryBtn} bg-brand-blue-primary text-white outline-brand-blue-primary hover:bg-brand-blue-dark`}
              >
                {commitState === 'committing' ? (
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                ) : (
                  <Check aria-hidden className="h-4 w-4" />
                )}
                {t('quizMediaResponse.capture.commit')}
              </button>
              <button
                type="button"
                onClick={recorder.discard}
                disabled={commitState === 'committing'}
                className={`${primaryBtn} border border-slate-300 bg-white text-slate-700 outline-slate-400 hover:bg-slate-50`}
              >
                <Trash2 aria-hidden className="h-4 w-4" />
                {t('quizMediaResponse.capture.discard')}
              </button>
            </>
          )}
        </div>
      </section>
      {showNotice && (
        <NoticeReminderOverlay
          onClose={() => {
            setShowNotice(false);
            reminderRef.current?.focus();
          }}
        />
      )}
    </>
  );
};

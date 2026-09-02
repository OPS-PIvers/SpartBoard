import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
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

export type CommitState = 'idle' | 'committing' | 'archive-failed';

export interface AudioResponseCaptureProps {
  config: RecordingConfig;
  /** Committed takes already on the response for this question. */
  takesCommitted: number;
  /** Notice acknowledgment for this assignment; null until the student acks. */
  noticeAckedAt: number | null;
  onAcknowledgeNotice: () => void;
  /** Resolves once the take is written; rejects to surface the failed state. */
  onCommit: (take: AudioTake) => Promise<void>;
  onPrepExpired?: (expiry: RecordingConfig['prepExpiry']) => void;
  onCaptureUnavailable?: () => void;
  /** Archive state of the most recent committed take, for "not yet submitted". */
  latestArtifact?: ResponseArtifact;
  /** Injected by tests and the DEV harness only. */
  recorderDeps?: AudioRecordingDeps;
  /** Forced state for the DEV harness; never set in the app. */
  commitStateOverride?: CommitState;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const cardCls =
  'rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur-sm';
const primaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

export const AudioResponseCapture: React.FC<AudioResponseCaptureProps> = ({
  config,
  takesCommitted,
  noticeAckedAt,
  onAcknowledgeNotice,
  onCommit,
  onPrepExpired,
  onCaptureUnavailable,
  latestArtifact,
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
    enabled: acknowledged && !takeBudgetReached,
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

  // Tennessen notice comes first — the mic is never probed before it.
  if (!acknowledged || showNotice) {
    return (
      <RecordingConsentNotice
        onAcknowledge={() => {
          setShowNotice(false);
          if (!acknowledged) onAcknowledgeNotice();
        }}
      />
    );
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
    latestArtifact?.uploadState === 'pending' || commitState === 'committing';
  const archiveFailed =
    latestArtifact?.uploadState === 'failed' ||
    commitState === 'archive-failed';

  return (
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
        <RecordingNoticeReminder onOpen={() => setShowNotice(true)} />
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
            <p className="font-mono text-5xl font-bold tabular-nums text-slate-900">
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
            <audio
              controls
              src={recorder.takeUrl}
              className="mt-3 w-full"
              aria-label={t('quizMediaResponse.capture.reviewPlayerLabel')}
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
        <p
          className={`mt-4 flex items-start gap-2 rounded-2xl p-3 text-sm ${
            archiveFailed
              ? 'bg-amber-50 text-amber-800'
              : 'bg-slate-100 text-slate-700'
          }`}
          role="status"
          aria-live="polite"
        >
          {archiveFailed ? (
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Loader2
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 animate-spin"
            />
          )}
          {archiveFailed
            ? t('quizMediaResponse.capture.notSubmittedFailed')
            : t('quizMediaResponse.capture.notSubmittedPending')}
        </p>
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

        {archiveFailed && phase === 'armed' && (
          <button
            type="button"
            onClick={() => setCommitState('idle')}
            className={`${primaryBtn} border border-slate-300 bg-white text-slate-700 outline-slate-400 hover:bg-slate-50`}
          >
            <RotateCcw aria-hidden className="h-4 w-4" />
            {t('quizMediaResponse.capture.dismissFailure')}
          </button>
        )}
      </div>
    </section>
  );
};

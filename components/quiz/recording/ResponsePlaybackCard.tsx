/**
 * The student's own recorded answer on the published-results screen (Brief
 * 3.6). Renders only when the teacher has published; the bytes are fetched
 * lazily on the student's first press, through the server-verified playback
 * callable — the Drive file is the teacher's and is never public.
 *
 * A take that is still archiving, failed, or compliance-deleted renders an
 * honest state instead of a player that would never load.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Hourglass, Loader2, Play } from 'lucide-react';
import type {
  ArtifactArchiveEntry,
  QuizResponseAnswer,
  WrittenAnswerAnnotation,
} from '@/types';
import { formatTimecode } from '@/utils/mediaGrading';
import {
  resolveArtifactPlaybackState,
  selectPlaybackTake,
} from '@/utils/responseArtifacts';
import {
  useQuizArtifactPlayback,
  type FetchPlayback,
  type PlaybackUnavailableReason,
} from '@/hooks/useQuizArtifactPlayback';
import { TakeReviewPlayer } from './TakeReviewPlayer';

export interface ResponsePlaybackCardProps {
  sessionId: string;
  responseKey: string;
  questionId: string;
  answers: readonly QuizResponseAnswer[];
  artifactArchive: Record<string, ArtifactArchiveEntry> | undefined;
  /** Which take the teacher graded, when they pinned one. */
  gradedTakeIndex?: number;
  /** Teacher timeline comments (ms offsets) on the graded take. */
  annotations?: readonly WrittenAnswerAnnotation[];
  light?: boolean;
  /** Injected by tests and the DEV harness only. */
  fetchPlayback?: FetchPlayback;
}

export const ResponsePlaybackCard: React.FC<ResponsePlaybackCardProps> = ({
  sessionId,
  responseKey,
  questionId,
  answers,
  artifactArchive,
  gradedTakeIndex,
  annotations,
  light = true,
  fetchPlayback,
}) => {
  const { t } = useTranslation();
  const [seek, setSeek] = useState({ ms: 0, nonce: 0 });
  const take = selectPlaybackTake(
    answers,
    questionId,
    'primary',
    gradedTakeIndex,
    artifactArchive
  );
  const timelineComments = useMemo(
    () =>
      [...(annotations ?? [])]
        .filter((a) => (a.comment ?? '').trim())
        .sort((a, b) => a.from - b.from),
    [annotations]
  );
  const entry = take ? artifactArchive?.[take.artifact.id] : undefined;
  const archiveState = resolveArtifactPlaybackState(entry);

  const { state, load } = useQuizArtifactPlayback(
    take && responseKey
      ? {
          sessionId,
          responseKey,
          questionId,
          slot: take.artifact.slot,
          artifactId: take.artifact.id,
        }
      : null,
    fetchPlayback
  );

  if (!take) return null;

  const labelCls = light ? 'text-slate-500' : 'text-slate-300';
  const bodyCls = light ? 'text-slate-600' : 'text-slate-300';
  const noticeCls = light
    ? 'border-slate-200 bg-slate-50'
    : 'border-slate-700 bg-slate-800/60';
  const commentHoverCls = light
    ? 'hover:bg-slate-100'
    : 'hover:bg-slate-700/60';
  const retryCls = light
    ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
    : 'border-slate-600 text-slate-200 hover:bg-slate-700/60';

  const notice = (
    icon: React.ReactNode,
    message: string,
    tone: 'neutral' | 'warning' = 'neutral'
  ) => (
    <div
      className={`mt-3 flex items-start gap-2 rounded-2xl border px-3 py-2 ${noticeCls}`}
    >
      <span
        className={`mt-0.5 shrink-0 ${
          tone === 'warning'
            ? light
              ? 'text-amber-600'
              : 'text-amber-300'
            : labelCls
        }`}
      >
        {icon}
      </span>
      <p className={`text-xs ${bodyCls}`}>{message}</p>
    </div>
  );

  const unavailableMessage = (reason: PlaybackUnavailableReason): string =>
    reason === 'deleted'
      ? t('quizMediaResponse.playback.deleted')
      : reason === 'failed'
        ? t('quizMediaResponse.playback.failed')
        : reason === 'too-large'
          ? t('quizMediaResponse.playback.tooLarge')
          : reason === 'no-recording'
            ? t('quizMediaResponse.playback.missing')
            : t('quizMediaResponse.playback.archiving');

  const playerShowing = archiveState === 'playable' && state.phase === 'ready';

  const body = () => {
    // Archive state comes off the student's own response doc, so the honest
    // state renders without spending a Drive call on a take that can't play.
    if (archiveState === 'archiving') {
      return notice(
        <Hourglass aria-hidden className="h-4 w-4" />,
        t('quizMediaResponse.playback.archiving')
      );
    }
    if (archiveState === 'failed') {
      return notice(
        <Hourglass aria-hidden className="h-4 w-4" />,
        t('quizMediaResponse.playback.failed')
      );
    }
    if (archiveState === 'lost') {
      return notice(
        <AlertTriangle aria-hidden className="h-4 w-4" />,
        t('quizMediaResponse.playback.lost'),
        'warning'
      );
    }
    if (archiveState === 'deleted') {
      return notice(
        <AlertTriangle aria-hidden className="h-4 w-4" />,
        t('quizMediaResponse.playback.deleted'),
        'warning'
      );
    }

    if (state.phase === 'ready') {
      return (
        <>
          <TakeReviewPlayer
            key={state.url}
            src={state.url}
            durationMs={state.durationMs || (take.artifact.durationMs ?? 0)}
            light={light}
            autoPlay
            seekToMs={seek.ms}
            seekNonce={seek.nonce}
          />
          {timelineComments.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {timelineComments.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSeek((prev) => ({
                        ms: Math.max(0, a.from),
                        nonce: prev.nonce + 1,
                      }))
                    }
                    className={`flex w-full items-start gap-2 rounded-2xl border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary ${noticeCls} ${commentHoverCls}`}
                  >
                    <span
                      className={`shrink-0 font-mono text-xs tabular-nums ${labelCls}`}
                    >
                      {formatTimecode(a.from)}
                    </span>
                    <span className={`text-xs ${bodyCls}`}>{a.comment}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }
    if (state.phase === 'unavailable') {
      return notice(
        <AlertTriangle aria-hidden className="h-4 w-4" />,
        unavailableMessage(state.reason),
        'warning'
      );
    }
    if (state.phase === 'error') {
      return (
        <div className="mt-3">
          {notice(
            <AlertTriangle aria-hidden className="h-4 w-4" />,
            t('quizMediaResponse.playback.error'),
            'warning'
          )}
          <button
            type="button"
            onClick={load}
            className={`mt-2 inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary ${retryCls}`}
          >
            {t('quizMediaResponse.playback.retry')}
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={load}
        disabled={state.phase === 'loading'}
        className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-blue-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.phase === 'loading' ? (
          <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
        ) : (
          <Play aria-hidden className="h-4 w-4" />
        )}
        {state.phase === 'loading'
          ? t('quizMediaResponse.playback.loading')
          : t('quizMediaResponse.playback.play')}
      </button>
    );
  };

  return (
    <div>
      <p
        className={`text-[10px] font-bold uppercase tracking-wider ${labelCls}`}
      >
        {t('quizMediaResponse.playback.label')}
      </p>
      {gradedTakeIndex !== undefined && (
        <p className={`mt-0.5 text-xs ${bodyCls}`}>
          {t('quizMediaResponse.playback.gradedTake', {
            n: take.displayIndex,
          })}
        </p>
      )}
      {timelineComments.length > 0 && (
        <p className={`mt-0.5 text-xs ${bodyCls}`}>
          {t('quizMediaResponse.playback.commentsHint')}
        </p>
      )}
      {/* Live only for notices; the player's progress bar must not chatter. */}
      <div aria-live={playerShowing ? undefined : 'polite'}>{body()}</div>
    </div>
  );
};

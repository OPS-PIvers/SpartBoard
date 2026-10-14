import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Hourglass, Loader2, PenLine } from 'lucide-react';
import type {
  ArtifactArchiveEntry,
  ArtifactSlot,
  QuizResponseAnswer,
  WhiteboardStartingPage,
  WrittenAnswerAnnotation,
} from '@/types';
import { formatTimecode } from '@/utils/mediaGrading';
import {
  isArtifactPlayable,
  resolveArtifactPlaybackState,
  selectWhiteboardTake,
} from '@/utils/responseArtifacts';
import type {
  FetchPlayback,
  PlaybackUnavailableReason,
} from '@/hooks/useQuizArtifactPlayback';
import { useQuizWhiteboardPlayback } from '@/hooks/useQuizWhiteboardPlayback';
import { WhiteboardReplayView } from '@/components/quiz/whiteboard/WhiteboardReplayView';
import { RubricStrandPills } from '@/components/widgets/QuizWidget/components/RubricStrandChips';

export interface WhiteboardPlaybackCardProps {
  sessionId: string;
  responseKey: string;
  questionId: string;
  slot?: ArtifactSlot;
  answers: readonly QuizResponseAnswer[];
  artifactArchive: Record<string, ArtifactArchiveEntry> | undefined;
  startingPage?: WhiteboardStartingPage;
  gradedTakeIndex?: number;
  annotations?: readonly WrittenAnswerAnnotation[];
  light?: boolean;
  /** Injected by tests and the DEV harness only. */
  fetchPlayback?: FetchPlayback;
}

/** The student's own whiteboard take on the published-results screen (D26). */
export const WhiteboardPlaybackCard: React.FC<WhiteboardPlaybackCardProps> = ({
  sessionId,
  responseKey,
  questionId,
  slot = 'primary',
  answers,
  artifactArchive,
  startingPage,
  gradedTakeIndex,
  annotations,
  light = true,
  fetchPlayback,
}) => {
  const { t } = useTranslation();
  const [seek, setSeek] = useState({ ms: 0, nonce: 0 });
  const [positionMs, setPositionMs] = useState(0);
  const take = selectWhiteboardTake(
    answers,
    questionId,
    slot,
    gradedTakeIndex,
    artifactArchive
  );
  const takeKey = take?.picture.id;
  const [seekTakeKey, setSeekTakeKey] = useState(takeKey);
  if (takeKey !== seekTakeKey) {
    setSeekTakeKey(takeKey);
    setSeek({ ms: 0, nonce: 0 });
    setPositionMs(0);
  }
  const timelineComments = useMemo(
    () =>
      [...(annotations ?? [])]
        .filter(
          (a) => (a.comment ?? '').trim() || (a.rubricCriteria?.length ?? 0) > 0
        )
        .sort((a, b) => a.from - b.from),
    [annotations]
  );
  const archiveState = resolveArtifactPlaybackState(
    take ? artifactArchive?.[take.picture.id] : undefined
  );
  const logPlayable =
    !!take?.log && isArtifactPlayable(artifactArchive?.[take.log.id]);
  const audioPlayable =
    !!take?.audio && isArtifactPlayable(artifactArchive?.[take.audio.id]);

  const { state, load } = useQuizWhiteboardPlayback(
    take && responseKey
      ? {
          sessionId,
          responseKey,
          questionId,
          slot,
          pictureId: take.picture.id,
          hasLog: logPlayable,
          hasAudio: audioPlayable,
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
      ? t('quizMediaResponse.whiteboardPlayback.deleted')
      : reason === 'too-large'
        ? t('quizMediaResponse.whiteboardPlayback.tooLarge')
        : reason === 'no-recording'
          ? t('quizMediaResponse.whiteboardPlayback.missing')
          : t('quizMediaResponse.whiteboardPlayback.archiving');

  // A comment is "active" from its moment until the next one starts.
  const activeCommentId = timelineComments.reduce<string | undefined>(
    (id, a) => (a.from <= positionMs ? a.id : id),
    undefined
  );

  const playerShowing = archiveState === 'playable' && state.phase === 'ready';

  const body = () => {
    if (archiveState === 'archiving' || archiveState === 'failed') {
      return notice(
        <Hourglass aria-hidden className="h-4 w-4" />,
        t('quizMediaResponse.whiteboardPlayback.archiving')
      );
    }
    if (archiveState === 'lost') {
      return notice(
        <AlertTriangle aria-hidden className="h-4 w-4" />,
        t('quizMediaResponse.whiteboardPlayback.lost'),
        'warning'
      );
    }
    if (archiveState === 'deleted') {
      return notice(
        <AlertTriangle aria-hidden className="h-4 w-4" />,
        t('quizMediaResponse.whiteboardPlayback.deleted'),
        'warning'
      );
    }

    if (state.phase === 'ready') {
      return (
        <>
          <div className="mt-3">
            <WhiteboardReplayView
              pictureUrl={state.pictureUrl}
              log={state.log}
              startingPage={startingPage}
              audioSrc={state.audioUrl}
              durationMs={state.durationMs}
              markers={timelineComments.map((a) => ({
                id: a.id,
                ms: Math.max(0, a.from),
                active: a.id === activeCommentId,
              }))}
              seekToMs={seek.ms}
              seekNonce={seek.nonce}
              onPositionChange={setPositionMs}
              light={light}
            />
          </div>
          {timelineComments.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {timelineComments.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    // no-tour-anchor: per-comment rows on a student page; tours walk teachers
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
                    <span className="min-w-0 flex-1">
                      <RubricStrandPills tags={a.rubricCriteria} />
                      {a.comment && (
                        <span className={`block text-xs ${bodyCls}`}>
                          {a.comment}
                        </span>
                      )}
                    </span>
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
            t('quizMediaResponse.whiteboardPlayback.error'),
            'warning'
          )}
          <button
            type="button"
            // no-tour-anchor: student results page; tours walk teachers
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
        // no-tour-anchor: student results page; tours walk teachers
        onClick={load}
        disabled={state.phase === 'loading'}
        className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-blue-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.phase === 'loading' ? (
          <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
        ) : (
          <PenLine aria-hidden className="h-4 w-4" />
        )}
        {state.phase === 'loading'
          ? t('quizMediaResponse.whiteboardPlayback.loading')
          : t('quizMediaResponse.whiteboardPlayback.show')}
      </button>
    );
  };

  return (
    <div>
      <p
        className={`text-[10px] font-bold uppercase tracking-wider ${labelCls}`}
      >
        {t('quizMediaResponse.whiteboardPlayback.label')}
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
      <div aria-live={playerShowing ? undefined : 'polite'}>{body()}</div>
    </div>
  );
};

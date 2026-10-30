import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
} from 'lucide-react';
import type {
  Rubric,
  WhiteboardStartingPage,
  WrittenAnswerAnnotation,
} from '@/types';
import type { WhiteboardLog } from '@/components/quiz/whiteboard/whiteboardLogTypes';
import {
  takeDurationMs,
  takeUnplayableReason,
  type MediaTake,
  type TakeFile,
} from '@/utils/mediaGrading';
import type { TakeUrlResolver } from '@/utils/quizMediaPlayback';
import { parseWhiteboardLog } from '@/components/quiz/whiteboard/whiteboardLog';
import { WhiteboardReplayView } from '@/components/quiz/whiteboard/WhiteboardReplayView';
import { tourTypeAttr } from '@/config/tourAnchors';
import { TimedNotesList } from './TimedNotesList';

export interface WhiteboardAnnotatedResponseViewProps {
  take: MediaTake;
  resolveTakeUrl: TakeUrlResolver;
  startingPage?: WhiteboardStartingPage;
  annotations: WrittenAnswerAnnotation[];
  onChange: (next: WrittenAnswerAnnotation[]) => void;
  authorUid: string;
  activeId: string | null;
  onActiveIdChange: (id: string | null) => void;
  disabled?: boolean;
  rubric?: Rubric;
  seekToMs?: number;
  seekNonce?: number;
}

interface LoadedFiles {
  pictureUrl: string | null;
  audioUrl: string | null;
  log: WhiteboardLog | null;
}

const EMPTY: LoadedFiles = { pictureUrl: null, audioUrl: null, log: null };

const driveIdOf = (file: TakeFile | undefined): string | undefined =>
  file?.playable ? file.archive?.driveFileId : undefined;

const makeId = (): string =>
  `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Grader view of one whiteboard take: final picture, timed replay, notes on its timeline. */
export const WhiteboardAnnotatedResponseView: React.FC<
  WhiteboardAnnotatedResponseViewProps
> = ({
  take,
  resolveTakeUrl,
  startingPage,
  annotations,
  onChange,
  authorUid,
  activeId,
  onActiveIdChange,
  disabled = false,
  rubric,
  seekToMs = 0,
  seekNonce = 0,
}) => {
  const { t } = useTranslation();
  const files = take.whiteboard;
  const pictureId = driveIdOf(files?.picture);
  const logId = driveIdOf(files?.log);
  const audioId = driveIdOf(files?.audio);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    files: LoadedFiles;
    error: string | null;
  } | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [localSeek, setLocalSeek] = useState({ ms: 0, count: 0, base: -1 });
  const resolverRef = useRef(resolveTakeUrl);
  useEffect(() => {
    resolverRef.current = resolveTakeUrl;
  }, [resolveTakeUrl]);

  const requestKey = `${pictureId ?? ''}|${audioId ?? ''}|${logId ?? ''}|${reloadNonce}`;
  const current = result?.key === requestKey ? result : null;
  const loaded = current?.files ?? EMPTY;
  const error = current?.error ?? null;
  const loading = !!pictureId && !current;

  // The three files live in the teacher's own Drive; fetch them together.
  useEffect(() => {
    if (!pictureId) return;
    let cancelled = false;
    const created: string[] = [];
    const resolve = (id: string | undefined): Promise<string | null> =>
      id
        ? resolverRef.current(id).then((url) => {
            created.push(url);
            return url;
          })
        : Promise.resolve(null);
    Promise.all([
      resolve(pictureId),
      resolve(audioId),
      // A missing or unreadable log still leaves the picture to grade.
      resolve(logId)
        .then(async (url) =>
          url ? parseWhiteboardLog(await (await fetch(url)).text()) : null
        )
        .catch(() => null),
    ])
      .then(([pictureUrl, audioUrl, log]) => {
        if (!cancelled)
          setResult({
            key: requestKey,
            files: { pictureUrl, audioUrl, log },
            error: null,
          });
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            key: requestKey,
            files: EMPTY,
            error: t('quizMediaResponse.grading.player.loadFailed'),
          });
      });
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pictureId, audioId, logId, requestKey, t]);

  const markers = useMemo(
    () =>
      annotations.map((a) => ({
        id: a.id,
        ms: a.from,
        active: a.id === activeId,
      })),
    [annotations, activeId]
  );

  // Every parent jump or note click bumps the summed nonce; the newest source wins.
  const seek = {
    ms: localSeek.base === seekNonce ? localSeek.ms : seekToMs,
    nonce: seekNonce + localSeek.count,
  };

  const addAtCursor = () => {
    const at = Math.round(playheadMs);
    const next: WrittenAnswerAnnotation = {
      id: makeId(),
      from: at,
      to: at,
      highlightColor: 'yellow',
      comment: '',
      authorUid,
      createdAt: Date.now(),
    };
    onChange([...annotations, next]);
    onActiveIdChange(next.id);
  };

  const unplayable = takeUnplayableReason(take);
  // Narration still archiving (or lost) would otherwise replay silently.
  const audioFile = files?.audio;
  const audioReason = audioFile
    ? takeUnplayableReason({
        ...take,
        archive: audioFile.archive,
        playable: audioFile.playable,
      })
    : null;
  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
        <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
        {t('quizMediaResponse.grading.player.loading')}
      </div>
    );
  }
  if (unplayable || error || !loaded.pictureUrl) {
    const reasonKey = unplayable ?? 'unknown';
    return (
      <div
        role="status"
        className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-5 text-sm text-amber-900"
      >
        <p className="flex items-center gap-2 font-bold">
          <AlertTriangle aria-hidden className="h-4 w-4" />
          {t(`quizMediaResponse.grading.player.unplayable.${reasonKey}.title`)}
        </p>
        <p className="mt-1 leading-relaxed">
          {error ??
            t(`quizMediaResponse.grading.player.unplayable.${reasonKey}.body`)}
        </p>
        {pictureId && (
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            {...tourTypeAttr('quiz-grading.audio-retry', 'quiz')}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
            {t('quizMediaResponse.grading.player.retry')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {audioReason && (
        <div
          role="status"
          className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle aria-hidden className="h-4 w-4" />
            {t(
              `quizMediaResponse.grading.player.unplayable.${audioReason}.title`
            )}
          </p>
          <p className="mt-1 leading-relaxed">
            {t(
              `quizMediaResponse.grading.player.unplayable.${audioReason}.body`
            )}
          </p>
        </div>
      )}
      <WhiteboardReplayView
        pictureUrl={loaded.pictureUrl}
        log={loaded.log}
        audioSrc={loaded.audioUrl}
        durationMs={takeDurationMs(take)}
        startingPage={startingPage}
        markers={markers}
        onPositionChange={setPlayheadMs}
        seekToMs={seek.ms}
        seekNonce={seek.nonce}
        controlsEnd={
          <button
            type="button"
            onClick={addAtCursor}
            {...tourTypeAttr('quiz-grading.whiteboard-add-comment', 'quiz')}
            disabled={disabled}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <MessageSquarePlus aria-hidden className="h-3.5 w-3.5" />
            {t('quizMediaResponse.grading.player.addComment')}
          </button>
        }
      />
      <TimedNotesList
        annotations={annotations}
        onChange={onChange}
        activeId={activeId}
        onActiveIdChange={onActiveIdChange}
        onSeek={(ms) =>
          setLocalSeek((prev) => ({
            ms,
            count: prev.count + 1,
            base: seekNonce,
          }))
        }
        disabled={disabled}
        rubric={rubric}
      />
    </div>
  );
};

export default WhiteboardAnnotatedResponseView;

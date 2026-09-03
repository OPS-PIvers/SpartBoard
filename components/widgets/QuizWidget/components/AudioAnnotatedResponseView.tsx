/**
 * AudioAnnotatedResponseView — the audio counterpart to
 * `AnnotatedResponseView`. Same annotation type, different anchor: `from`/`to`
 * are milliseconds into the graded take rather than plaintext offsets, so the
 * timeline (not a text run) carries the markers.
 *
 * Playback chrome mirrors the student recorder's `TakeReviewPlayer` — a hidden
 * `<audio>` element driving styled controls, never the browser's own.
 */

import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Loader2,
  MessageSquarePlus,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Trash2,
} from 'lucide-react';
import type { WrittenAnswerAnnotation } from '@/types';
import {
  formatTimecode,
  type TakeUnplayableReason,
} from '@/utils/mediaGrading';
import { useAudioPeaks } from '@/hooks/useAudioPeaks';
import { nextSpeechStart } from '@/utils/audioSilence';
import { WaveformScrubber } from '@/components/quiz/recording/WaveformScrubber';

const SKIP_LEAD_MS = 150;

export interface AudioAnnotatedResponseViewProps {
  /** Object URL for the take; null while resolving or when unplayable. */
  src: string | null;
  durationMs: number;
  loading: boolean;
  /** Load failure message, or a lifecycle reason the take cannot play. */
  error: string | null;
  unplayableReason: TakeUnplayableReason | null;
  onRetryLoad?: () => void;
  annotations: WrittenAnswerAnnotation[];
  onChange: (next: WrittenAnswerAnnotation[]) => void;
  authorUid: string;
  activeId: string | null;
  onActiveIdChange: (id: string | null) => void;
  disabled?: boolean;
}

const makeId = (): string =>
  `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const AudioAnnotatedResponseView: React.FC<
  AudioAnnotatedResponseViewProps
> = ({
  src,
  durationMs,
  loading,
  error,
  unplayableReason,
  onRetryLoad,
  annotations,
  onChange,
  authorUid,
  activeId,
  onActiveIdChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const totalMs = Math.max(durationMs, 1);
  const { peaks, silent, status: peaksStatus } = useAudioPeaks(src);
  const hasGap = silent?.some(Boolean) ?? false;

  const sorted = useMemo(
    () => [...annotations].sort((a, b) => a.from - b.from),
    [annotations]
  );

  const markers = useMemo(
    () =>
      sorted.map((a) => ({ id: a.id, ms: a.from, active: a.id === activeId })),
    [sorted, activeId]
  );

  const seekTo = (ms: number) => {
    const el = audioRef.current;
    setElapsedMs(ms);
    if (el) el.currentTime = ms / 1000;
  };

  const skipToSpeech = () => {
    if (!silent || silent.length === 0) return;
    const idx = Math.min(
      silent.length - 1,
      Math.floor((elapsedMs / totalMs) * silent.length)
    );
    const next = nextSpeechStart(silent, idx);
    if (next === null) return;
    const windowStartMs = (next / silent.length) * totalMs;
    seekTo(Math.max(0, Math.round(windowStartMs - SKIP_LEAD_MS)));
  };

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const addAtCursor = () => {
    const at = Math.round(elapsedMs);
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

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
        <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
        {t('quizMediaResponse.grading.player.loading')}
      </div>
    );
  }

  if (unplayableReason || error || !src) {
    const reasonKey = unplayableReason ?? 'unknown';
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
        {onRetryLoad && (
          <button
            type="button"
            onClick={onRetryLoad}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
            {t('quizMediaResponse.grading.player.retry')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <audio
        ref={audioRef}
        src={src}
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setElapsedMs(totalMs);
        }}
        onTimeUpdate={(e) => setElapsedMs(e.currentTarget.currentTime * 1000)}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={
            playing
              ? t('quizMediaResponse.grading.player.pause')
              : t('quizMediaResponse.grading.player.play')
          }
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue-primary text-white transition hover:bg-brand-blue-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary"
        >
          {playing ? (
            <Pause aria-hidden className="h-4 w-4" />
          ) : (
            <Play aria-hidden className="h-4 w-4" />
          )}
        </button>

        {peaksStatus === 'ready' && hasGap && (
          <button
            type="button"
            onClick={skipToSpeech}
            aria-label={t('quizMediaResponse.grading.player.skipToSpeech')}
            title={t('quizMediaResponse.grading.player.skipToSpeech')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary"
          >
            <SkipForward aria-hidden className="h-4 w-4" />
          </button>
        )}

        <div className="relative flex-1">
          {peaksStatus === 'ready' && peaks && silent ? (
            <WaveformScrubber
              peaks={peaks}
              silent={silent}
              durationMs={totalMs}
              currentMs={Math.min(elapsedMs, totalMs)}
              markers={markers}
              onSeek={seekTo}
              ariaLabel={t('quizMediaResponse.grading.player.scrubber')}
              ariaValueText={t('quizMediaResponse.grading.player.valueText', {
                elapsed: formatTimecode(elapsedMs),
                total: formatTimecode(totalMs),
              })}
            />
          ) : (
            <>
              {peaksStatus === 'loading' && (
                <div
                  aria-hidden
                  data-testid="waveform-loading"
                  className="mb-1 h-0.5 w-full overflow-hidden rounded-full bg-slate-200"
                >
                  <div className="h-full w-full -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-brand-blue-primary to-transparent motion-reduce:animate-none motion-reduce:translate-x-0" />
                </div>
              )}
              <input
                type="range"
                min={0}
                max={totalMs}
                step={100}
                value={Math.min(elapsedMs, totalMs)}
                onChange={(e) => seekTo(Number(e.target.value))}
                aria-label={t('quizMediaResponse.grading.player.scrubber')}
                aria-valuetext={t(
                  'quizMediaResponse.grading.player.valueText',
                  {
                    elapsed: formatTimecode(elapsedMs),
                    total: formatTimecode(totalMs),
                  }
                )}
                className="w-full accent-brand-blue-primary"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-2"
              >
                {sorted.map((a) => (
                  <span
                    key={a.id}
                    className={`absolute top-0 h-2 w-1 rounded-full ${
                      a.id === activeId ? 'bg-violet-600' : 'bg-amber-500'
                    }`}
                    style={{
                      left: `${Math.min(100, (a.from / totalMs) * 100)}%`,
                    }}
                  />
                ))}
              </div>
            </>
          )}
          <div className="sr-only" aria-live="polite">
            {t('quizMediaResponse.grading.player.valueText', {
              elapsed: formatTimecode(elapsedMs),
              total: formatTimecode(totalMs),
            })}
          </div>
        </div>

        <span className="shrink-0 font-mono text-xs tabular-nums text-slate-600">
          {formatTimecode(elapsedMs)} / {formatTimecode(totalMs)}
        </span>

        <button
          type="button"
          onClick={addAtCursor}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <MessageSquarePlus aria-hidden className="h-3.5 w-3.5" />
          {t('quizMediaResponse.grading.player.addComment')}
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {sorted.length === 0 && (
          <li className="text-xs italic leading-relaxed text-slate-500">
            {t('quizMediaResponse.grading.player.noComments')}
          </li>
        )}
        {sorted.map((a) => (
          <li
            key={a.id}
            className={`rounded-lg border p-2 transition-colors ${
              a.id === activeId
                ? 'border-violet-400 bg-violet-50'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onActiveIdChange(a.id);
                  seekTo(a.from);
                }}
                className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs tabular-nums text-slate-700 transition hover:bg-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={t('quizMediaResponse.grading.player.seekTo', {
                  time: formatTimecode(a.from),
                })}
              >
                {formatTimecode(a.from)}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(annotations.filter((x) => x.id !== a.id));
                  if (activeId === a.id) onActiveIdChange(null);
                }}
                className="ml-auto rounded p-1 text-slate-500 transition hover:bg-slate-200 hover:text-brand-red-primary disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={t(
                  'quizMediaResponse.grading.player.removeComment',
                  {
                    time: formatTimecode(a.from),
                  }
                )}
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
            <label className="mt-1.5 block">
              <span className="sr-only">
                {t('quizMediaResponse.grading.player.commentLabel', {
                  time: formatTimecode(a.from),
                })}
              </span>
              <textarea
                value={a.comment ?? ''}
                disabled={disabled}
                rows={2}
                placeholder={t(
                  'quizMediaResponse.grading.player.commentPlaceholder'
                )}
                onFocus={() => onActiveIdChange(a.id)}
                onChange={(e) =>
                  onChange(
                    annotations.map((x) =>
                      x.id === a.id ? { ...x, comment: e.target.value } : x
                    )
                  )
                }
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 disabled:bg-slate-100"
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AudioAnnotatedResponseView;

/**
 * The one audio player for student recording surfaces — pre-submit review in
 * `AudioResponseCapture` and post-publish playback in `ResponsePlaybackCard`.
 * Native `<audio>` is the engine; the chrome is ours so both surfaces read as
 * one control instead of two different browser default players.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';
import { formatClock } from './formatClock';

export const TakeReviewPlayer: React.FC<{
  src: string;
  durationMs: number;
  /** The published-results screen is dark for a live (teacher-paced) quiz. */
  light?: boolean;
  /** Set when the player mounts in response to the student's own press. */
  autoPlay?: boolean;
  /** Target of a parent-requested seek, in ms into the take. */
  seekToMs?: number;
  /** Bumped by the parent to (re-)request the seek above. */
  seekNonce?: number;
}> = ({
  src,
  durationMs,
  light = true,
  autoPlay = false,
  seekToMs = 0,
  seekNonce = 0,
}) => {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [measuredMs, setMeasuredMs] = useState(0);
  // A take committed by Chrome can report `Infinity`; the element's own
  // metadata is the fallback once the file is decoded.
  const totalMs = Math.max(
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs : measuredMs,
    1
  );
  const pct = Math.min(100, Math.round((elapsedMs / totalMs) * 100));

  // The media element is an external system; a blocked autoplay is harmless.
  useEffect(() => {
    if (!autoPlay) return;
    void Promise.resolve(audioRef.current?.play()).catch(() => undefined);
  }, [autoPlay, src]);

  // Only a fresh nonce is a seek request; the ref makes `seekToMs` an honest
  // dependency without re-seeking when the parent merely re-renders.
  const handledSeekNonceRef = useRef(0);

  // The media element is external; a parent-driven seek must reach it.
  useEffect(() => {
    if (!seekNonce || handledSeekNonceRef.current === seekNonce) return;
    handledSeekNonceRef.current = seekNonce;
    const el = audioRef.current;
    if (!el) return;
    // `onTimeUpdate` carries the new position back into state.
    el.currentTime = Math.max(0, seekToMs) / 1000;
    void Promise.resolve(el.play()).catch(() => undefined);
  }, [seekNonce, seekToMs]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const shellCls = light
    ? 'border-slate-200 bg-white'
    : 'border-slate-700 bg-slate-800/60';
  const trackCls = light ? 'bg-slate-200' : 'bg-slate-700';
  const timeCls = light ? 'text-slate-600' : 'text-slate-300';

  return (
    <div
      className={`mt-3 flex items-center gap-3 rounded-2xl border px-3 py-2 ${shellCls}`}
    >
      {/* Hidden native element: playback engine only, no browser chrome. */}
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
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setMeasuredMs(d * 1000);
        }}
        onTimeUpdate={(e) => setElapsedMs(e.currentTarget.currentTime * 1000)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={
          playing
            ? t('quizMediaResponse.capture.pausePlayback')
            : t('quizMediaResponse.capture.playPlayback')
        }
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue-primary text-white transition hover:bg-brand-blue-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary"
      >
        {playing ? (
          <Pause aria-hidden className="h-4 w-4" />
        ) : (
          <Play aria-hidden className="h-4 w-4" />
        )}
      </button>
      <div
        role="progressbar"
        aria-label={t('quizMediaResponse.capture.playbackPosition')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={t('quizMediaResponse.capture.playbackValueText', {
          elapsed: formatClock(elapsedMs / 1000),
          total: formatClock(totalMs / 1000),
        })}
        className={`h-2 flex-1 overflow-hidden rounded-full ${trackCls}`}
      >
        <div
          className="h-full rounded-full bg-brand-blue-primary motion-safe:transition-[width] motion-safe:duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono text-xs tabular-nums ${timeCls}`}>
        {formatClock(elapsedMs / 1000)} / {formatClock(totalMs / 1000)}
      </span>
    </div>
  );
};

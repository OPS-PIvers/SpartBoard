import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pause, Play } from 'lucide-react';
import type { DrawableObject, WhiteboardStartingPage } from '@/types';
import { renderStartingPageCanvas } from '@/utils/whiteboard/startingPage';
import { useStartingPageImages } from './useStartingPageImages';
import { useAudioPeaks } from '@/hooks/useAudioPeaks';
import { formatClock } from '@/components/quiz/recording/formatClock';
import { WaveformScrubber } from '@/components/quiz/recording/WaveformScrubber';
import { tourTypeAttr } from '@/config/tourAnchors';
import {
  createWhiteboardReplayer,
  whiteboardLogDuration,
  type WhiteboardLog,
} from './whiteboardLog';
import {
  PAGE_H,
  PAGE_W,
  paintReplayFrame,
  type ReplayMarker,
} from './replayFrame';

const MAX_BACKING_SCALE = 2;
const SILENT_BUCKETS = 200;

export interface WhiteboardReplayViewProps {
  /** Final picture (D20); shown until the viewer plays or scrubs (D24). */
  pictureUrl: string | null;
  log: WhiteboardLog | null;
  startingPage?: WhiteboardStartingPage;
  /** Narration; absent for a draw-only take, which gets a silent timeline. */
  audioSrc?: string | null;
  durationMs: number;
  loading?: boolean;
  markers?: ReplayMarker[];
  /** Target of a parent-requested seek, in ms into the take. */
  seekToMs?: number;
  /** Bumped by the parent to (re-)request the seek above. */
  seekNonce?: number;
  onPositionChange?: (ms: number) => void;
  /** Extra controls at the end of the transport row (the grader's comment button). */
  controlsEnd?: React.ReactNode;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export const WhiteboardReplayView: React.FC<WhiteboardReplayViewProps> = ({
  pictureUrl,
  log,
  startingPage,
  audioSrc,
  durationMs,
  loading = false,
  markers,
  seekToMs = 0,
  seekNonce = 0,
  onPositionChange,
  controlsEnd,
}) => {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [backingScale, setBackingScale] = useState(1);

  const totalMs = Math.max(
    durationMs > 0 ? durationMs : log ? whiteboardLogDuration(log) : 0,
    1
  );
  const replayer = useMemo(
    () => (log ? createWhiteboardReplayer(log) : null),
    [log]
  );
  const { images: startingImages } = useStartingPageImages(startingPage);
  const { peaks, silent } = useAudioPeaks(audioSrc ?? null);
  const silentTimeline = useMemo(
    () => ({
      peaks: new Float32Array(SILENT_BUCKETS),
      silent: new Array<boolean>(SILENT_BUCKETS).fill(false),
    }),
    []
  );

  // Painted at the canvas backing size so pattern lines stay crisp.
  const background = useMemo(
    () =>
      startingPage && typeof document !== 'undefined'
        ? renderStartingPageCanvas(startingPage, startingImages, backingScale)
        : null,
    [startingPage, startingImages, backingScale]
  );
  const ink = useMemo(
    () =>
      typeof document !== 'undefined' ? document.createElement('canvas') : null,
    []
  );

  // The frame's on-screen size picks the canvas backing size (ResizeObserver).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.getBoundingClientRect().width;
      setBackingScale(clamp((w * dpr) / PAGE_W, 0.25, MAX_BACKING_SCALE));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const canReplay = Boolean(log);
  const showCanvas = canReplay && (started || !pictureUrl);
  const frameMs = started ? currentMs : totalMs;

  const painted = useRef<{
    objects: readonly DrawableObject[];
    background: HTMLCanvasElement | null;
    canvas: HTMLCanvasElement | null;
  } | null>(null);

  // Paint the replay frame into the canvas, an external system.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !showCanvas || !ink) return;
    const w = Math.round(PAGE_W * backingScale);
    const h = Math.round(PAGE_H * backingScale);
    const resized = canvas.width !== w || canvas.height !== h;
    if (resized) {
      canvas.width = w;
      canvas.height = h;
    }
    const objects = replayer ? replayer.seek(frameMs) : [];
    const last = painted.current;
    // The replayer returns the same array while nothing changed.
    if (
      !resized &&
      last?.objects === objects &&
      last.background === background &&
      last.canvas === canvas
    )
      return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintReplayFrame(ctx, background, ink, objects, backingScale);
    painted.current = { objects, background, canvas };
  }, [showCanvas, frameMs, replayer, background, ink, backingScale]);

  const latestRef = useRef({ currentMs, totalMs, onPositionChange });
  useLayoutEffect(() => {
    latestRef.current = { currentMs, totalMs, onPositionChange };
  });

  // Wall-clock anchor for a draw-only take; the audio element is the clock otherwise.
  const clockRef = useRef({ at: 0, ms: 0 });

  // The playback clock runs on requestAnimationFrame, an external system.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const el = audioRef.current;
      const { totalMs: total, onPositionChange: report } = latestRef.current;
      const clock = clockRef.current;
      const ms =
        audioSrc && el
          ? el.currentTime * 1000
          : clock.ms + (performance.now() - clock.at);
      const next = Math.min(ms, total);
      setCurrentMs(next);
      report?.(next);
      if (!audioSrc && next >= total) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, audioSrc]);

  const seekTo = (ms: number) => {
    const next = clamp(ms, 0, totalMs);
    setStarted(true);
    setCurrentMs(next);
    onPositionChange?.(next);
    clockRef.current = { at: performance.now(), ms: next };
    const el = audioRef.current;
    if (audioSrc && el) el.currentTime = next / 1000;
  };

  const play = () => {
    const from = !started || currentMs >= totalMs ? 0 : currentMs;
    seekTo(from);
    const el = audioRef.current;
    if (audioSrc && el) {
      el.currentTime = from / 1000;
      void Promise.resolve(el.play()).catch(() => setPlaying(false));
    }
    setPlaying(true);
  };

  const pause = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  // Only a fresh nonce is a seek request.
  const handledSeekNonceRef = useRef(0);
  useEffect(() => {
    if (!seekNonce || handledSeekNonceRef.current === seekNonce) return;
    handledSeekNonceRef.current = seekNonce;
    const next = clamp(seekToMs, 0, latestRef.current.totalMs);
    setStarted(true);
    setCurrentMs(next);
    clockRef.current = { at: performance.now(), ms: next };
    const el = audioRef.current;
    if (audioSrc && el) el.currentTime = next / 1000;
  }, [seekNonce, seekToMs, audioSrc]);

  const timeline =
    audioSrc && peaks && silent ? { peaks, silent } : silentTimeline;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          className="hidden"
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrentMs(totalMs);
          }}
        />
      )}
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
        style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-600">
            <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
            {t('quizWhiteboardResponse.replay.loading')}
          </div>
        ) : showCanvas ? (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t('quizWhiteboardResponse.replay.replayLabel')}
            className="block h-full w-full"
          />
        ) : pictureUrl ? (
          <img
            src={pictureUrl}
            alt={t('quizWhiteboardResponse.replay.pictureAlt')}
            className="block h-full w-full object-contain"
            draggable={false}
          />
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={playing ? pause : play}
          disabled={!canReplay || loading}
          {...tourTypeAttr('quiz-whiteboard.replay-play', 'quiz')}
          aria-label={
            playing
              ? t('quizWhiteboardResponse.replay.pause')
              : t('quizWhiteboardResponse.replay.play')
          }
          title={
            canReplay
              ? undefined
              : t('quizWhiteboardResponse.replay.unavailable')
          }
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue-primary text-white transition hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary"
        >
          {playing ? (
            <Pause aria-hidden className="h-4 w-4" />
          ) : (
            <Play aria-hidden className="h-4 w-4" />
          )}
        </button>
        <div
          className="flex-1"
          {...tourTypeAttr('quiz-whiteboard.replay-scrubber', 'quiz')}
        >
          <WaveformScrubber
            peaks={timeline.peaks}
            silent={timeline.silent}
            durationMs={totalMs}
            currentMs={clamp(currentMs, 0, totalMs)}
            markers={markers ?? []}
            onSeek={canReplay ? seekTo : () => undefined}
            ariaLabel={t('quizMediaResponse.capture.playbackPosition')}
            ariaValueText={t('quizMediaResponse.capture.playbackValueText', {
              elapsed: formatClock(currentMs / 1000),
              total: formatClock(totalMs / 1000),
            })}
          />
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-slate-600">
          {formatClock(currentMs / 1000)} / {formatClock(totalMs / 1000)}
        </span>
        {controlsEnd}
      </div>
    </div>
  );
};

export default WhiteboardReplayView;

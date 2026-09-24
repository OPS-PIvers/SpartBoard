import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Scissors } from 'lucide-react';
import type { GuidedLearningVideoTrim } from '@/types';

// ─── Video trim bar ──────────────────────────────────────────────────────────

function formatTrimTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/**
 * Dual-handle playback-range selector for the current video slide.
 * Non-destructive: writes `{start, end}` seconds via `onChange` (or `null`
 * when the handles cover the full video). Dragging a handle scrubs the
 * canvas video to that moment so the teacher can find cut points visually.
 */
export const VideoTrimBar: React.FC<{
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Video duration in seconds; null while metadata is still loading. */
  duration: number | null;
  trim: GuidedLearningVideoTrim | null;
  onChange: (trim: GuidedLearningVideoTrim | null) => void;
}> = ({ videoRef, duration, trim, onChange }) => {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  // Holds the in-flight drag's window listeners so they can be torn down if
  // the bar unmounts mid-drag. The editor unmounts this on slide change
  // (setTrimOpen(false)); without cleanup the orphaned onMove keeps firing
  // and writes a trim to the *previous* slide's index.
  const dragRef = useRef<{
    onMove: (e: PointerEvent) => void;
    onUp: (e: PointerEvent) => void;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (dragRef.current) {
        window.removeEventListener('pointermove', dragRef.current.onMove);
        window.removeEventListener('pointerup', dragRef.current.onUp);
        window.removeEventListener('pointercancel', dragRef.current.onUp);
        dragRef.current = null;
      }
    };
  }, []);

  if (duration === null) {
    return (
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 shrink-0">
        <Loader2
          className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {t('glStudio.trimLoading')}
      </div>
    );
  }

  const minGap = Math.min(0.5, duration);
  const start = Math.min(trim?.start ?? 0, Math.max(duration - minGap, 0));
  const end = Math.min(trim?.end ?? duration, duration);

  const commit = (nextStart: number, nextEnd: number) => {
    // Full-range selection = no trim; drop the field instead of storing a
    // degenerate {0, duration} that would block playback-rate edge cases.
    if (nextStart <= 0.05 && nextEnd >= duration - 0.05) {
      onChange(null);
      return;
    }
    onChange({
      start: Math.round(nextStart * 10) / 10,
      end: Math.round(nextEnd * 10) / 10,
    });
  };

  const scrubTo = (seconds: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = seconds;
  };

  const beginDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    handle: 'start' | 'end'
  ) => {
    const track = trackRef.current;
    if (!track) return;
    e.preventDefault();
    // Pause while scrubbing so the dragged frame holds still; always resume
    // on release — the editor preview is a muted autoplay loop, and reading
    // `paused` here races against the previous drag's async play().
    videoRef.current?.pause();
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // capture not supported — window listeners below still work
    }

    const timeAt = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      // A hidden/zero-width track would yield NaN and poison the trim state.
      if (rect.width === 0) return 0;
      const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      return pct * duration;
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const t = timeAt(ev.clientX);
      if (handle === 'start') {
        const next = Math.min(t, end - minGap);
        commit(Math.max(next, 0), end);
        scrubTo(Math.max(next, 0));
      } else {
        const next = Math.max(t, start + minGap);
        commit(start, Math.min(next, duration));
        scrubTo(Math.min(next, duration));
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragRef.current = null;
      try {
        if (target.hasPointerCapture(ev.pointerId)) {
          target.releasePointerCapture(ev.pointerId);
        }
      } catch {
        // capture not supported — nothing to release
      }
      void videoRef.current?.play().catch(() => undefined);
    };
    dragRef.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const nudge = (handle: 'start' | 'end', deltaSeconds: number) => {
    if (handle === 'start') {
      const next = Math.min(Math.max(start + deltaSeconds, 0), end - minGap);
      commit(next, end);
      scrubTo(next);
    } else {
      const next = Math.max(
        Math.min(end + deltaSeconds, duration),
        start + minGap
      );
      commit(start, next);
      scrubTo(next);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    handle: 'start' | 'end'
  ) => {
    const step = e.shiftKey ? 2 : 0.5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(handle, -step);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      nudge(handle, step);
    }
  };

  const startPct = (start / duration) * 100;
  const endPct = (end / duration) * 100;

  const handleClasses =
    'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-7 rounded-md bg-white border-2 border-brand-blue-primary shadow-sm cursor-ew-resize touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50';

  return (
    <div className="flex flex-wrap items-center gap-3 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0">
        <Scissors
          className="w-3.5 h-3.5 text-brand-blue-primary"
          aria-hidden="true"
        />
        {t('glStudio.trim')}
      </span>
      <div
        ref={trackRef}
        className="relative flex-1 min-w-[180px] h-7 select-none"
      >
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-200" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-brand-blue-primary"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('glStudio.trimStart')}
          aria-valuemin={0}
          aria-valuemax={Math.max(end - minGap, 0)}
          aria-valuenow={start}
          aria-valuetext={formatTrimTime(start)}
          className={handleClasses}
          style={{ left: `${startPct}%` }}
          onPointerDown={(e) => beginDrag(e, 'start')}
          onKeyDown={(e) => handleKeyDown(e, 'start')}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('glStudio.trimEnd')}
          aria-valuemin={Math.min(start + minGap, duration)}
          aria-valuemax={duration}
          aria-valuenow={end}
          aria-valuetext={formatTrimTime(end)}
          className={handleClasses}
          style={{ left: `${endPct}%` }}
          onPointerDown={(e) => beginDrag(e, 'end')}
          onKeyDown={(e) => handleKeyDown(e, 'end')}
        />
      </div>
      <span className="text-xs font-mono font-medium text-slate-600 tabular-nums shrink-0">
        {formatTrimTime(start)} – {formatTrimTime(end)}
        <span className="text-slate-400"> / {formatTrimTime(duration)}</span>
      </span>
      <button
        type="button"
        onClick={() => {
          onChange(null);
          scrubTo(0);
        }}
        disabled={!trim}
        className="text-xs font-bold text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-default transition-colors shrink-0"
      >
        {t('glStudio.trimReset')}
      </button>
    </div>
  );
};

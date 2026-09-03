import React, { useEffect, useRef, useState } from 'react';

export interface WaveformScrubberProps {
  peaks: Float32Array;
  silent: boolean[];
  durationMs: number;
  currentMs: number;
  markers: { ms: number; id: string; active?: boolean }[];
  onSeek: (ms: number) => void;
  ariaLabel?: string;
  ariaValueText?: string;
  className?: string;
}

const PLAYED = '#2d3f89';
const UNPLAYED = '#94a3b8';
const SILENT_BAND = 'rgba(51, 65, 85, 0.18)';
const CURSOR = '#1d2a5d';
const MARKER = '#f59e0b';
const MARKER_ACTIVE = '#7c3aed';
const ARROW_STEP_MS = 2000;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export const WaveformScrubber: React.FC<WaveformScrubberProps> = ({
  peaks,
  silent,
  durationMs,
  currentMs,
  markers,
  onSeek,
  ariaLabel = 'Playback position',
  ariaValueText,
  className = '',
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dragging = useRef(false);
  const totalMs = Math.max(durationMs, 1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(0, r.width), h: Math.max(0, r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const dpr =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const W = Math.round(size.w * dpr);
    const H = Math.round(size.h * dpr);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const n = peaks.length;
    if (n === 0) return;
    const bucketW = W / n;
    const playedX = (clamp(currentMs, 0, totalMs) / totalMs) * W;
    const mid = H / 2;
    const minBar = Math.max(1, dpr);

    ctx.fillStyle = SILENT_BAND;
    let runStart: number | null = null;
    for (let i = 0; i <= n; i++) {
      const isSilent = i < n && silent[i] === true;
      if (isSilent && runStart === null) runStart = i;
      if (!isSilent && runStart !== null) {
        ctx.fillRect(runStart * bucketW, 0, (i - runStart) * bucketW, H);
        runStart = null;
      }
    }

    const gap = bucketW > 3 * dpr ? dpr : 0;
    for (let i = 0; i < n; i++) {
      const x = i * bucketW;
      const barH = Math.max(minBar, peaks[i] * (H - 2 * dpr));
      ctx.fillStyle = x + bucketW / 2 <= playedX ? PLAYED : UNPLAYED;
      ctx.fillRect(x, mid - barH / 2, Math.max(1, bucketW - gap), barH);
    }

    for (const m of markers) {
      const mx = (clamp(m.ms, 0, totalMs) / totalMs) * W;
      ctx.fillStyle = m.active ? MARKER_ACTIVE : MARKER;
      ctx.fillRect(mx - dpr, 0, 2 * dpr, Math.max(4 * dpr, H * 0.3));
    }

    ctx.fillStyle = CURSOR;
    ctx.fillRect(playedX - dpr / 2, 0, Math.max(1, dpr), H);
  }, [peaks, silent, currentMs, totalMs, markers, size]);

  const seekFromClientX = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const frac = clamp((clientX - r.left) / r.width, 0, 1);
    onSeek(Math.round(frac * totalMs));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button > 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekFromClientX(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    seekFromClientX(e.clientX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = currentMs - ARROW_STEP_MS;
    else if (e.key === 'ArrowRight') next = currentMs + ARROW_STEP_MS;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = totalMs;
    if (next === null) return;
    e.preventDefault();
    onSeek(Math.round(clamp(next, 0, totalMs)));
  };

  return (
    <div
      ref={wrapRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.round(totalMs / 1000)}
      aria-valuenow={Math.round(clamp(currentMs, 0, totalMs) / 1000)}
      aria-valuetext={ariaValueText}
      aria-orientation="horizontal"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={`relative h-12 w-full cursor-pointer touch-none select-none rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary ${className}`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none block h-full w-full"
      />
    </div>
  );
};

export default WaveformScrubber;

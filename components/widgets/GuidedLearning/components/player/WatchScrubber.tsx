import React, { useRef } from 'react';

interface Props {
  count: number;
  index: number;
  /** 0–1 through the current step. */
  progress: number;
  onSeek: (index: number) => void;
}

/** Per-step segments; clicking or dragging seeks to a step's start. */
export const WatchScrubber: React.FC<Props> = ({
  count,
  index,
  progress,
  onSeek,
}) => {
  const dragging = useRef(false);

  const seekAt = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const next = Math.min(Math.floor(frac * count), count - 1);
    if (next !== index) onSeek(next);
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Walkthrough position"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={index + 1}
      aria-valuetext={`Step ${index + 1} of ${count}`}
      className="flex-1 flex items-center cursor-pointer touch-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
      style={{
        gap: count > 20 ? 1 : 'min(3px, 0.8cqmin)',
        height: 'clamp(16px, 4cqmin, 24px)',
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        seekAt(e.currentTarget, e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) seekAt(e.currentTarget, e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          onSeek(Math.max(index - 1, 0));
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          onSeek(Math.min(index + 1, count - 1));
        } else if (e.key === 'Home') {
          e.preventDefault();
          onSeek(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          onSeek(count - 1);
        }
      }}
    >
      {Array.from({ length: count }, (_, i) => {
        const fill = i < index ? 1 : i === index ? Math.min(progress, 1) : 0;
        return (
          <div
            key={i}
            data-testid="gl-scrub-segment"
            className="flex-1 rounded-full bg-white/15 overflow-hidden"
            style={{ height: 'clamp(6px, 1.5cqmin, 10px)' }}
          >
            <div
              className="h-full bg-indigo-400"
              style={{ width: `${fill * 100}%` }}
            />
          </div>
        );
      })}
    </div>
  );
};

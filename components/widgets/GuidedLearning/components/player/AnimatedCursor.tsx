import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ZOOM_EASE } from '../../utils/motion';
import { curvePoint } from './playback';

interface Point {
  x: number;
  y: number;
}

interface Props {
  from: Point;
  to: Point;
  /** Glide time; 0 places the cursor at `to` without animating (reduced motion). */
  durationMs: number;
  /** Click ripple at the target once the glide ends (Watch). */
  ripple?: boolean;
  onDone?: () => void;
}

const RIPPLE_MS = 420;
const SAMPLES = 16;

const at = (p: Point) => `translate(${p.x}px, ${p.y}px)`;

/** Demo cursor that glides to a target, optionally with a click ripple. */
export const AnimatedCursor: React.FC<Props> = ({
  from,
  to,
  durationMs,
  ripple = false,
  onDone,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [arrived, setArrived] = useState(durationMs <= 0);
  const finish = useEffectEvent(() => onDone?.());

  // Drives the glide through the Web Animations API; jsdom and old browsers fall back to a timer.
  useEffect(() => {
    const el = ref.current;
    if (!el || durationMs <= 0) return;
    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      setArrived(true);
    };
    if (typeof el.animate === 'function') {
      const frames = Array.from({ length: SAMPLES + 1 }, (_, i) => ({
        transform: at(curvePoint(from, to, i / SAMPLES)),
      }));
      const anim = el.animate(frames, {
        duration: durationMs,
        easing: ZOOM_EASE,
      });
      anim.onfinish = land;
      return () => {
        done = true;
        anim.cancel();
      };
    }
    const id = setTimeout(land, durationMs);
    return () => {
      done = true;
      clearTimeout(id);
    };
    // A new glide is keyed by the caller; points are read once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ripple (or none) after landing, then report done.
  useEffect(() => {
    if (!arrived) return;
    const wait = ripple && durationMs > 0 ? RIPPLE_MS : 0;
    const id = setTimeout(() => finish(), wait);
    return () => clearTimeout(id);
  }, [arrived, ripple, durationMs]);

  return (
    <div
      ref={ref}
      data-testid="gl-cursor"
      data-arrived={arrived ? 'true' : 'false'}
      aria-hidden="true"
      className="absolute left-0 top-0 z-40 pointer-events-none"
      style={{ transform: at(arrived ? to : from) }}
    >
      {arrived && ripple && durationMs > 0 && (
        <span
          data-testid="gl-cursor-ripple"
          className="absolute rounded-full border-2 border-white"
          style={{
            left: 'calc(min(36px, 8cqmin) / -2)',
            top: 'calc(min(36px, 8cqmin) / -2)',
            width: 'min(36px, 8cqmin)',
            height: 'min(36px, 8cqmin)',
            animation: `gl-ripple ${RIPPLE_MS}ms ease-out both`,
          }}
        />
      )}
      <svg
        viewBox="0 0 24 24"
        style={{
          width: 'min(28px, 6cqmin)',
          height: 'min(28px, 6cqmin)',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
          overflow: 'visible',
        }}
      >
        <path
          d="M1 1 L1 19 L6 14.5 L9.5 22 L13 20.5 L9.5 13 L16 13 Z"
          fill="#0f172a"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

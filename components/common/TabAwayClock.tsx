import React, { useEffect, useState } from 'react';
import type { TabAwayState } from '@/hooks/useTabAwayTracker';
import { formatAwayDuration } from '@/utils/tabAwayLimit';

interface TabAwayClockProps {
  away: TabAwayState;
  limitMs: number;
  autoSubmit: boolean;
}

const RING_RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Screen readers hear the countdown only at 30, 10 and 5 seconds left. */
function announcementFor(remainingMs: number): string {
  if (remainingMs <= 0) return '';
  if (remainingMs <= 5_000) return '5 seconds left';
  if (remainingMs <= 10_000) return '10 seconds left';
  if (remainingMs <= 30_000) return '30 seconds left';
  return '';
}

/**
 * The clock inside the tab-switch overlay: counts down to auto-submit when the
 * teacher turned it on, otherwise counts up how long the student was away.
 */
export const TabAwayClock: React.FC<TabAwayClockProps> = ({
  away,
  limitMs,
  autoSubmit,
}) => {
  const [now, setNow] = useState(() => performance.now());
  const live = away.outcome === null;
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [live]);

  const elapsed = away.durationMs ?? Math.max(0, now - away.leftAtPerf);

  if (!autoSubmit) {
    return (
      <p className="text-3xl font-black text-white tabular-nums mb-6">
        Away {formatAwayDuration(elapsed)}
      </p>
    );
  }

  const remaining = Math.max(0, limitMs - elapsed);
  const timedOut = away.outcome === 'auto-submitted' || remaining === 0;
  return (
    <div className="relative mb-6 h-28 w-28">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="8"
          className="stroke-white/20"
        />
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - remaining / limitMs)}
          className="stroke-white"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        {timedOut ? (
          <span className="text-lg font-black leading-tight">
            Time&apos;s up
          </span>
        ) : (
          <>
            <span className="text-2xl font-black tabular-nums leading-none">
              {formatAwayDuration(remaining + 999)}
            </span>
            <span className="text-xs font-bold text-red-100">left</span>
          </>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {live ? announcementFor(remaining) : ''}
      </span>
    </div>
  );
};

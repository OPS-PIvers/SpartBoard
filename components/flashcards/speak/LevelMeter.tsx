import React, { useState } from 'react';
import { cx } from '../playerUtils';
import { useMicLevel } from './useMicLevel';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const LevelMeter: React.FC<{
  level: number;
  label: string;
  dark: boolean;
}> = ({ level, label, dark }) => {
  const [reduced] = useState(prefersReducedMotion);
  const pct = Math.round(level * 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cx(
        'w-full overflow-hidden rounded-full',
        dark ? 'bg-white/15' : 'bg-slate-200'
      )}
      style={{ height: 'min(8px, 1.8cqmin)', maxWidth: 'min(280px, 60cqmin)' }}
    >
      <div
        className={cx(
          'h-full rounded-full bg-rose-600',
          !reduced && 'transition-[width] duration-75'
        )}
        // Reduced motion shows a steady half bar while listening instead of a moving one.
        style={{ width: reduced ? '50%' : `${Math.max(4, pct)}%` }}
      />
    </div>
  );
};

/** Reads the stream itself so only the meter re-renders each frame. */
export const LiveLevelMeter: React.FC<{
  stream: MediaStream | null;
  label: string;
  dark: boolean;
}> = ({ stream, ...rest }) => (
  <LevelMeter level={useMicLevel(stream)} {...rest} />
);

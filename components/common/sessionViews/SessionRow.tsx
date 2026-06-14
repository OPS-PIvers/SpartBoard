import React from 'react';
import type { ScoreTone } from '@/utils/scoreColor';

type DotTone = 'success' | 'warn' | 'neutral' | 'danger';

const TINT: Record<ScoreTone, string> = {
  success: 'bg-emerald-50/60',
  warn: 'bg-amber-50/60',
  danger: 'bg-rose-50/60',
};

const DOT_COLOR: Record<DotTone, string> = {
  success: 'bg-emerald-500',
  warn: 'bg-amber-500',
  neutral: 'bg-slate-400',
  danger: 'bg-red-500',
};

interface SessionRowProps {
  /** Leading status dot; pulse for live. Omit to render an empty reserved slot. */
  dot?: { tone: DotTone; pulse?: boolean };
  /** Subtle full-row score-band wash (teacher "colors" toggle). */
  tintTone?: ScoreTone;
  /** Main row content (name, badges, meta). */
  children: React.ReactNode;
  /** Right-aligned trailing slot (score pill, actions, overflow). */
  trailing?: React.ReactNode;
  onClick?: () => void;
}

/**
 * Hairline list-row shell matching the library's list rows: gapless container
 * (each row carries its own bottom border), a reserved status-dot slot for
 * column alignment, an optional score-band wash, and a transient hover. Content
 * and trailing slot are supplied by each view.
 */
export const SessionRow: React.FC<SessionRowProps> = ({
  dot,
  tintTone,
  children,
  trailing,
  onClick,
}) => {
  return (
    <div
      data-testid="session-row"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`flex items-center border-b border-slate-200/60 last:border-b-0 rounded-lg transition-colors ${
        tintTone ? TINT[tintTone] : 'hover:bg-white/60'
      } ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        gap: 'min(10px, 2.2cqmin)',
        paddingInline: 'min(12px, 2.6cqmin)',
        paddingBlock: 'min(10px, 2.2cqmin)',
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center"
        style={{ width: 'min(8px, 2cqmin)' }}
        aria-hidden="true"
      >
        {dot && (
          <span
            className={`rounded-full ${DOT_COLOR[dot.tone]} ${
              dot.pulse ? 'animate-pulse' : ''
            }`}
            style={{ width: 'min(8px, 2cqmin)', height: 'min(8px, 2cqmin)' }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
      {trailing && (
        <div
          className="flex items-center shrink-0"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          {trailing}
        </div>
      )}
    </div>
  );
};

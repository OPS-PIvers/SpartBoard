import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type SessionTone = 'success' | 'warn' | 'info' | 'neutral' | 'danger';

const TONE: Record<SessionTone, { bg: string; fg: string; dot: string }> = {
  success: {
    bg: 'bg-emerald-100',
    fg: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  warn: { bg: 'bg-amber-100', fg: 'text-amber-700', dot: 'bg-amber-500' },
  info: { bg: 'bg-blue-100', fg: 'text-blue-700', dot: 'bg-blue-500' },
  neutral: { bg: 'bg-slate-200', fg: 'text-slate-500', dot: 'bg-slate-400' },
  danger: { bg: 'bg-red-100', fg: 'text-red-700', dot: 'bg-red-500' },
};

interface SessionBadgeProps {
  tone: SessionTone;
  label: string;
  icon?: LucideIcon;
  /** Render a leading status dot (success dots pulse). */
  dot?: boolean;
  /** Reserve a fixed min-width so badges align in a column. */
  fixedWidth?: boolean;
}

/**
 * Tone-based status/info badge matching the library's badge language:
 * pill-shaped, uppercase, tracking-wide, fully container-query scaled.
 */
export const SessionBadge: React.FC<SessionBadgeProps> = ({
  tone,
  label,
  icon: Icon,
  dot = false,
  fixedWidth = false,
}) => {
  const t = TONE[tone];
  return (
    <span
      data-testid="session-badge"
      className={`inline-flex items-center justify-center rounded-full font-bold uppercase tracking-wide shrink-0 ${t.bg} ${t.fg}`}
      style={{
        gap: 'min(4px, 1cqmin)',
        minWidth: fixedWidth ? 'min(60px, 14cqmin)' : undefined,
        paddingInline: 'min(8px, 2cqmin)',
        paddingBlock: 'min(2px, 0.6cqmin)',
        fontSize: 'min(10px, 3cqmin)',
      }}
    >
      {dot && (
        <span
          className={`rounded-full ${t.dot} ${tone === 'success' ? 'animate-pulse' : ''}`}
          style={{ width: 'min(6px, 1.8cqmin)', height: 'min(6px, 1.8cqmin)' }}
        />
      )}
      {Icon && (
        <Icon
          style={{ width: 'min(12px, 4cqmin)', height: 'min(12px, 4cqmin)' }}
        />
      )}
      {label}
    </span>
  );
};

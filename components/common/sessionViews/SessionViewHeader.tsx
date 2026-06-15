import React from 'react';
import { ChevronLeft } from 'lucide-react';

type ViewStatus = 'live' | 'paused' | 'ended' | 'none';

interface SessionViewHeaderProps {
  /** Back handler. When omitted, no back button renders. */
  onBack?: () => void;
  status?: ViewStatus;
  title: string;
  subtitle?: string;
  /** Right-aligned action buttons / overflow. */
  actions?: React.ReactNode;
}

const STATUS: Record<
  Exclude<ViewStatus, 'none'>,
  { dot: string; label: string; text: string; pulse: boolean }
> = {
  live: {
    dot: 'bg-brand-red-primary',
    label: 'Live',
    text: 'text-brand-red-primary',
    pulse: true,
  },
  paused: {
    dot: 'bg-amber-500',
    label: 'Paused',
    text: 'text-amber-600',
    pulse: false,
  },
  ended: {
    dot: 'bg-slate-400',
    label: 'Ended',
    text: 'text-slate-500',
    pulse: false,
  },
};

/**
 * Shared header for the monitor and results views: glass chrome, back button,
 * an optional live/paused/ended status pulse, title/subtitle, and a
 * right-aligned actions slot. Matches the library header surface.
 */
export const SessionViewHeader: React.FC<SessionViewHeaderProps> = ({
  onBack,
  status = 'none',
  title,
  subtitle,
  actions,
}) => {
  const s = status !== 'none' ? STATUS[status] : null;
  return (
    <div
      className="flex items-center justify-between bg-white/60 backdrop-blur-sm border-b border-slate-200/70 shrink-0"
      style={{
        gap: 'min(12px, 2.5cqmin)',
        paddingInline: 'min(16px, 3.5cqmin)',
        paddingBlock: 'min(8px, 1.8cqmin)',
      }}
    >
      <div
        className="flex items-center min-w-0"
        style={{ gap: 'min(10px, 2.2cqmin)' }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="inline-flex shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/70 hover:text-brand-blue-primary"
            style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
          >
            <ChevronLeft
              style={{
                width: 'min(18px, 5cqmin)',
                height: 'min(18px, 5cqmin)',
              }}
            />
          </button>
        )}
        {s && (
          <span
            className="flex shrink-0 items-center"
            style={{ gap: 'min(5px, 1.2cqmin)' }}
          >
            <span
              className={`rounded-full ${s.dot} ${s.pulse ? 'animate-pulse motion-reduce:animate-none' : ''}`}
              style={{ width: 'min(8px, 2cqmin)', height: 'min(8px, 2cqmin)' }}
            />
            <span
              className={`font-black uppercase tracking-tight leading-none ${s.text}`}
              style={{ fontSize: 'min(12px, 4cqmin)' }}
            >
              {s.label}
            </span>
          </span>
        )}
        <div className="min-w-0">
          <div
            className="font-black text-slate-800 truncate"
            style={{ fontSize: 'min(15px, 4.8cqmin)' }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              className="font-medium text-slate-500 truncate"
              style={{ fontSize: 'min(11px, 3.2cqmin)' }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div
          className="flex items-center shrink-0"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          {actions}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ScaledEmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

/**
 * A container-query-scaled empty state for widgets.
 *
 * All sizing uses `cqmin` (the smaller of container width/height)
 * so the content automatically scales when the widget is resized.
 *
 * Override `iconClassName`, `titleClassName`, or `subtitleClassName` to theme
 * per widget background (defaults are slate tones for dark widgets).
 *
 * Usage:
 *   <ScaledEmptyState icon={Clock} title="No Schedule" subtitle="Flip to add items." />
 */
export const ScaledEmptyState: React.FC<ScaledEmptyStateProps> = ({
  icon: Icon,
  title,
  subtitle,
  action,
  className = '',
  iconClassName = 'text-slate-300',
  titleClassName = 'text-slate-200',
  subtitleClassName = 'text-slate-300',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center h-full w-full text-center select-none ${className}`}
      style={{ gap: '2cqmin', padding: '4cqmin' }}
    >
      <div
        className={iconClassName}
        style={{
          width: 'min(48px, 15cqmin)',
          height: 'min(48px, 15cqmin)',
        }}
      >
        <Icon aria-hidden="true" style={{ width: '100%', height: '100%' }} />
      </div>
      <div className="flex flex-col" style={{ gap: '0.5cqmin' }}>
        <p
          className={`font-black uppercase tracking-widest ${titleClassName}`}
          style={{ fontSize: 'min(14px, 4cqmin)' }}
        >
          {title}
        </p>
        {subtitle && (
          <p
            className={`leading-tight ${subtitleClassName}`}
            style={{ fontSize: 'min(12px, 3cqmin)' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
};

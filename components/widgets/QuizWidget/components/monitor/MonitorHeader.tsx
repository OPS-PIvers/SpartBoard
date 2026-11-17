// The monitor header shared by Quiz and Writing: Back, title and the Live, Paused or Ended pill.
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

export type MonitorHeaderStatus = 'live' | 'paused' | 'ended';

const PILL: Record<MonitorHeaderStatus, { label: string; cls: string }> = {
  live: { label: 'Live', cls: 'bg-white text-brand-blue-primary' },
  paused: { label: 'Paused', cls: 'bg-white/20 text-white' },
  ended: { label: 'Ended', cls: 'bg-white/20 text-white' },
};

export const MonitorHeader: React.FC<{
  title: string;
  status: MonitorHeaderStatus;
  /** Omitted hides Back. */
  onBack?: () => void;
  backAnchor: TourAnchorAttrs;
  /** The widget's header color; omitted keeps Quiz's brand blue. */
  accent?: string;
  /** Room on the right, e.g. for a connected Review's corner tab. */
  paddingRight?: number | string;
}> = ({
  title,
  status,
  accent,
  onBack,
  backAnchor,
  paddingRight = 'min(12px, 3cqmin)',
}) => {
  const pill = PILL[status];
  return (
    <div
      className="flex items-center bg-brand-blue-primary text-white shrink-0"
      style={{
        ...(accent ? { backgroundColor: accent } : {}),
        gap: 'min(8px, 2cqmin)',
        paddingBlock: 'min(10px, 2.5cqmin)',
        paddingLeft: 'min(12px, 3cqmin)',
        paddingRight,
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back"
          {...backAnchor}
          className="rounded-md hover:bg-white/15 transition-colors"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <ArrowLeft
            style={{
              width: 'min(16px, 5cqmin)',
              height: 'min(16px, 5cqmin)',
            }}
          />
        </button>
      )}
      <p
        className="font-sans font-semibold truncate flex-1"
        style={{ fontSize: 'min(14px, 5cqmin)' }}
      >
        {title}
      </p>
      <span
        className={`shrink-0 rounded-full font-sans font-semibold uppercase tracking-wider ${pill.cls}`}
        style={{
          ...(accent && status === 'live' ? { color: accent } : {}),
          fontSize: 'min(10px, 3.5cqmin)',
          padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
        }}
      >
        {pill.label}
      </span>
    </div>
  );
};

import React, { useRef, useState } from 'react';
import { ChevronDown, Loader2, Pause, Play } from 'lucide-react';
import type { PeriodAccess } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useServerNow } from '@/hooks/useServerNow';
import { Z_INDEX } from '@/config/zIndex';
import { tourTypeAttr } from '@/config/tourAnchors';
import {
  effectivePeriodState,
  type EffectivePeriodState,
} from '@/utils/periodAccess';

const STATE_LABEL: Record<EffectivePeriodState, string> = {
  open: 'Live',
  paused: 'Paused',
  closed: 'Closed',
  scheduled: 'Scheduled',
  ended: 'Ended',
};

const formatClock = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

const iconStyle = {
  width: 'min(14px, 4.5cqmin)',
  height: 'min(14px, 4.5cqmin)',
};

export interface PeriodBarProps {
  periodAccess: Record<string, PeriodAccess>;
  /** The period key the monitor shows, or '' for every class. */
  selected: string;
  onSelect: (key: string) => void;
  onStart: (key: string) => Promise<void>;
  onPause: (key: string) => Promise<void>;
  onExtend: (key: string, by: number | null) => Promise<void>;
  extendMs: number;
}

function useEntries(periodAccess: Record<string, PeriodAccess>) {
  const entries = Object.entries(periodAccess).sort(([, a], [, b]) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
  const ticking = entries.some(
    ([, a]) => a.closeAt != null || a.openAt != null
  );
  const now = useServerNow(ticking ? 1000 : 30_000);
  return entries.map(([key, access]) => ({
    key,
    access,
    state: effectivePeriodState(access, now),
  }));
}

const statusText = (access: PeriodAccess, state: EffectivePeriodState) => {
  const pin = access.verified ? '' : ' · PIN';
  if (state === 'open' && access.closeAt != null)
    return `Live until ${formatClock(access.closeAt)}${pin}`;
  if (state === 'scheduled' && access.openAt != null)
    return `Opens ${formatClock(access.openAt)}${pin}`;
  return `${STATE_LABEL[state]}${pin}`;
};

type Row = ReturnType<typeof useEntries>[number];

/** Class picker; each option carries its class's state, so the picked one reads at a glance. */
const PeriodPicker: React.FC<
  Pick<PeriodBarProps, 'selected' | 'onSelect'> & { rows: Row[] }
> = ({ rows, selected, onSelect }) => {
  const current = rows.find((r) => r.key === selected);
  const liveCount = rows.filter((r) => r.state === 'open').length;
  const text = { fontSize: 'min(16px, 5.5cqmin)' };

  return (
    <div
      className="flex flex-wrap items-center min-w-0"
      style={{ gap: 'min(10px, 2.5cqmin)' }}
    >
      <select
        aria-label="Class"
        {...tourTypeAttr('quiz-monitor.period-class-picker', 'quiz')}
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        className="min-w-0 max-w-full rounded-md border border-brand-gray-lighter bg-white font-sans font-bold text-brand-blue-dark"
        style={{ ...text, padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)' }}
      >
        <option value="">All classes</option>
        {rows.map((r) => (
          <option key={r.key} value={r.key}>
            {r.access.label} · {statusText(r.access, r.state)}
          </option>
        ))}
      </select>
      {!current && (
        <span
          className="whitespace-nowrap font-sans font-bold text-brand-blue-dark"
          style={text}
        >
          {liveCount} of {rows.length} live
        </span>
      )}
    </div>
  );
};

/** Start or Pause for the picked class, plus More time while it has a close time. */
const PeriodAction: React.FC<
  Omit<PeriodBarProps, 'onSelect' | 'periodAccess'> & { rows: Row[] }
> = ({ rows, selected, onStart, onPause, onExtend, extendMs }) => {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));
  const current = rows.find((r) => r.key === selected);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const button = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    primary: boolean
  ) => (
    <button
      key={label}
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center rounded-md font-sans font-semibold transition-colors disabled:opacity-60 ${
        primary
          ? 'bg-brand-blue-primary hover:bg-brand-blue-light text-white'
          : 'border border-brand-blue-primary/40 bg-white text-brand-blue-dark hover:bg-brand-blue-lighter'
      }`}
      style={{
        gap: 'min(6px, 1.5cqmin)',
        padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
        fontSize: 'min(13px, 4.5cqmin)',
      }}
    >
      {busy ? <Loader2 className="animate-spin" style={iconStyle} /> : icon}
      {label}
    </button>
  );

  if (!current) return null;

  const live = current.state === 'open';
  return (
    <div
      ref={menuRef}
      className="relative flex shrink-0"
      style={{ gap: 'min(6px, 1.5cqmin)' }}
    >
      {live && current.access.closeAt != null && (
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`More time for ${current.access.label}`}
          aria-expanded={menuOpen}
          {...tourTypeAttr('quiz-monitor.period-more-time', 'quiz')}
          className="inline-flex items-center rounded-md border border-brand-blue-primary/40 bg-white font-sans font-semibold text-brand-blue-dark hover:bg-brand-blue-lighter"
          style={{
            gap: 'min(4px, 1cqmin)',
            padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
            fontSize: 'min(13px, 4.5cqmin)',
          }}
        >
          More time
          <ChevronDown style={iconStyle} />
        </button>
      )}
      {live
        ? button(
            'Pause',
            <Pause style={iconStyle} />,
            () => void run(() => onPause(current.key)),
            false
          )
        : button(
            'Start',
            <Play style={iconStyle} />,
            () => void run(() => onStart(current.key)),
            true
          )}
      {menuOpen && (
        <div
          className="absolute right-0 top-full bg-white border border-brand-gray-lighter rounded-lg shadow-lg overflow-hidden text-brand-gray-dark"
          style={{
            zIndex: Z_INDEX.dropdown,
            marginTop: 'min(4px, 1cqmin)',
            minWidth: 'min(140px, 50cqw)',
          }}
        >
          {[
            { label: `+${Math.round(extendMs / 60000)} min`, by: extendMs },
            { label: 'Until I pause', by: null },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setMenuOpen(false);
                void run(() => onExtend(current.key, item.by));
              }}
              className="block w-full text-left hover:bg-brand-blue-lighter transition-colors"
              style={{
                fontSize: 'min(12px, 4cqmin)',
                padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Class picker and status with the picked class's Start or Pause, in one row. */
export const PeriodBar: React.FC<PeriodBarProps> = ({
  periodAccess,
  ...props
}) => {
  const rows = useEntries(periodAccess);
  return (
    <div
      className="flex flex-wrap items-center justify-between"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      <PeriodPicker rows={rows} {...props} />
      <PeriodAction rows={rows} {...props} />
    </div>
  );
};

import React, { useRef, useState } from 'react';
import { ChevronDown, Loader2, Pause, Play } from 'lucide-react';
import type { PeriodAccess } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useServerNow } from '@/hooks/useServerNow';
import { Z_INDEX } from '@/config/zIndex';
import {
  effectivePeriodState,
  type EffectivePeriodState,
} from '@/utils/periodAccess';
import { shortPeriodLabels } from './monitorUtils';

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
  onStart: (keys: string[]) => Promise<void>;
  onPause: (keys: string[]) => Promise<void>;
  onExtend: (key: string, by: number | null) => Promise<void>;
  extendMs: number;
}

function useEntries(periodAccess: Record<string, PeriodAccess>) {
  const entries = Object.entries(periodAccess).sort(([, a], [, b]) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
  const short = shortPeriodLabels(entries.map(([, a]) => a.label));
  const ticking = entries.some(
    ([, a]) => a.closeAt != null || a.openAt != null
  );
  const now = useServerNow(ticking ? 1000 : 30_000);
  return entries.map(([key, access], i) => ({
    key,
    access,
    label: short[i],
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

/** Class picker and the picked class's status, for the start of the monitor bar. */
type Row = ReturnType<typeof useEntries>[number];

const PeriodPicker: React.FC<
  Pick<PeriodBarProps, 'selected' | 'onSelect'> & { rows: Row[] }
> = ({ rows, selected, onSelect }) => {
  const current = rows.find((r) => r.key === selected);
  const liveCount = rows.filter((r) => r.state === 'open').length;
  const text = { fontSize: 'min(13px, 4.5cqmin)' };

  return (
    <div
      className="flex items-center min-w-0"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      <select
        aria-label="Class"
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        className="shrink-0 rounded-md border border-brand-blue-primary/30 bg-white font-sans font-bold text-brand-blue-dark"
        style={{ ...text, padding: 'min(4px, 1cqmin) min(8px, 2cqmin)' }}
      >
        <option value="">All classes</option>
        {rows.map((r) => (
          <option key={r.key} value={r.key}>
            {r.access.label}
          </option>
        ))}
      </select>
      <span
        className="whitespace-nowrap font-sans font-semibold text-brand-gray-dark"
        style={text}
      >
        {current
          ? statusText(current.access, current.state)
          : `${liveCount} of ${rows.length} live`}
      </span>
    </div>
  );
};

/** The classes not on screen, each with its state; tap one to show it. */
const PeriodOthers: React.FC<
  Pick<PeriodBarProps, 'selected' | 'onSelect'> & { rows: Row[] }
> = ({ rows: all, selected, onSelect }) => {
  const rows = all.filter((r) => r.key !== selected);
  return (
    <div
      role="group"
      aria-label="Other classes"
      className="flex flex-wrap items-center"
      style={{ columnGap: 'min(12px, 3cqmin)', rowGap: 'min(2px, 0.5cqmin)' }}
    >
      {rows.map((r) => (
        <button
          key={r.key}
          onClick={() => onSelect(r.key)}
          title={r.access.label}
          className="font-sans text-brand-gray-primary hover:text-brand-blue-dark hover:underline"
          style={{ fontSize: 'min(12px, 4cqmin)' }}
        >
          <span className="font-semibold">{r.label}</span>{' '}
          {statusText(r.access, r.state)}
        </button>
      ))}
    </div>
  );
};

/** Start or Pause for the picked class, or every class under All classes. */
const PeriodAction: React.FC<
  Omit<PeriodBarProps, 'onSelect' | 'periodAccess'> & { rows: Row[] }
> = ({ rows, selected, onStart, onPause, onExtend, extendMs }) => {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));
  const current = rows.find((r) => r.key === selected);
  const keys = rows.map((r) => r.key);

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

  if (!current) {
    const anyLive = rows.some((r) => r.state === 'open');
    const anyIdle = rows.some((r) => r.state !== 'open');
    return (
      <div className="flex shrink-0" style={{ gap: 'min(6px, 1.5cqmin)' }}>
        {anyLive &&
          button(
            'Pause all',
            <Pause style={iconStyle} />,
            () => void run(() => onPause(keys)),
            !anyIdle
          )}
        {anyIdle &&
          button(
            'Start all',
            <Play style={iconStyle} />,
            () => void run(() => onStart(keys)),
            true
          )}
      </div>
    );
  }

  const live = current.state === 'open';
  return (
    <div
      ref={menuRef}
      className="relative flex shrink-0"
      style={{ gap: 'min(6px, 1.5cqmin)' }}
    >
      {live && (
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`More time for ${current.access.label}`}
          aria-expanded={menuOpen}
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
            () => void run(() => onPause([current.key])),
            false
          )
        : button(
            'Start',
            <Play style={iconStyle} />,
            () => void run(() => onStart([current.key])),
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

/** Class picker with its Start/Pause, then the other classes, for the top of the monitor bar. */
export const PeriodBar: React.FC<PeriodBarProps> = ({
  periodAccess,
  ...props
}) => {
  const rows = useEntries(periodAccess);
  return (
    <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
      <div
        className="flex flex-wrap items-center justify-between"
        style={{ gap: 'min(8px, 2cqmin)' }}
      >
        <PeriodPicker rows={rows} {...props} />
        <PeriodAction rows={rows} {...props} />
      </div>
      <PeriodOthers rows={rows} {...props} />
    </div>
  );
};

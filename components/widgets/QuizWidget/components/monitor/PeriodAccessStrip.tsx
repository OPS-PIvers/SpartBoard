import React, { useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { PeriodAccess } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useServerNow } from '@/hooks/useServerNow';
import { Z_INDEX } from '@/config/zIndex';
import {
  effectivePeriodState,
  type EffectivePeriodState,
} from '@/utils/periodAccess';

const STATE_TEXT: Record<
  EffectivePeriodState,
  { mark: string; label: string }
> = {
  open: { mark: '●', label: 'Live' },
  paused: { mark: '❚❚', label: 'Paused' },
  closed: { mark: '○', label: 'Closed' },
  scheduled: { mark: '◷', label: 'Scheduled' },
  ended: { mark: '○', label: 'Ended' },
};

const formatLeft = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};

const formatClock = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

export interface PeriodAccessStripProps {
  periodAccess: Record<string, PeriodAccess>;
  onStart: (key: string) => Promise<void>;
  onPause: (key: string) => Promise<void>;
  onExtend: (key: string, by: number | null) => Promise<void>;
  extendMs: number;
}

const Chip: React.FC<{
  periodKey: string;
  access: PeriodAccess;
  now: number;
  busy: boolean;
  onToggle: () => void;
  onExtend: (by: number | null) => void;
  extendMs: number;
}> = ({ periodKey, access, now, busy, onToggle, onExtend, extendMs }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));
  const state = effectivePeriodState(access, now);
  const text = STATE_TEXT[state];
  const counting = state === 'open' && access.closeAt != null;
  const status =
    state === 'scheduled' && access.openAt != null
      ? `Opens ${formatClock(access.openAt)}`
      : text.label;
  const action = state === 'open' ? 'Pause' : 'Start';
  const live = state === 'open';

  return (
    <div
      ref={menuRef}
      className={`relative inline-flex items-stretch rounded-full border font-sans ${
        live
          ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
          : 'bg-white border-brand-gray-lighter text-brand-gray-dark'
      }`}
      style={{ fontSize: 'min(11px, 3.8cqmin)' }}
      data-period-key={periodKey}
    >
      <button
        onClick={onToggle}
        disabled={busy}
        aria-label={`${action} ${access.label}, now ${status}`}
        className="inline-flex items-center rounded-full disabled:opacity-60"
        style={{
          gap: 'min(4px, 1cqmin)',
          padding: 'min(3px, 0.8cqmin) min(8px, 2cqmin)',
        }}
      >
        {busy ? (
          <Loader2
            className="animate-spin"
            aria-hidden
            style={{
              width: 'min(11px, 3.8cqmin)',
              height: 'min(11px, 3.8cqmin)',
            }}
          />
        ) : (
          <span aria-hidden>{text.mark}</span>
        )}
        <span className="font-semibold">{access.label}</span>
        <span>{status}</span>
        {!access.verified && (
          <span
            className={live ? 'text-white/85' : 'text-brand-gray-primary'}
            title="Students join with a PIN, which isn't verified"
          >
            · PIN
          </span>
        )}
      </button>
      {counting && (
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`Time left for ${access.label}`}
          aria-expanded={menuOpen}
          className="inline-flex items-center border-l border-white/30 tabular-nums"
          style={{
            gap: 'min(2px, 0.5cqmin)',
            padding: 'min(3px, 0.8cqmin) min(8px, 2cqmin)',
          }}
        >
          <span aria-hidden>⏱</span>
          {formatLeft((access.closeAt ?? now) - now)}
          <ChevronDown
            aria-hidden
            style={{
              width: 'min(11px, 3.8cqmin)',
              height: 'min(11px, 3.8cqmin)',
            }}
          />
        </button>
      )}
      {menuOpen && (
        <div
          className="absolute left-0 top-full bg-white border border-brand-gray-lighter rounded-lg shadow-lg overflow-hidden text-brand-gray-dark"
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
                onExtend(item.by);
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

/** One chip per period: tap to start or pause it, and adjust a live period's close time. */
export const PeriodAccessStrip: React.FC<PeriodAccessStripProps> = ({
  periodAccess,
  onStart,
  onPause,
  onExtend,
  extendMs,
}) => {
  const entries = Object.entries(periodAccess).sort(([, a], [, b]) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
  const ticking = entries.some(
    ([, a]) => a.closeAt != null || a.openAt != null
  );
  const now = useServerNow(ticking ? 1000 : 30_000);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await fn();
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div
      role="group"
      aria-label="Class periods"
      className="flex flex-wrap items-center"
      style={{ gap: 'min(4px, 1cqmin)' }}
    >
      {entries.map(([key, access]) => (
        <Chip
          key={key}
          periodKey={key}
          access={access}
          now={now}
          busy={busyKey === key}
          extendMs={extendMs}
          onToggle={() =>
            void run(key, () =>
              effectivePeriodState(access, now) === 'open'
                ? onPause(key)
                : onStart(key)
            )
          }
          onExtend={(by) => void run(key, () => onExtend(key, by))}
        />
      ))}
    </div>
  );
};

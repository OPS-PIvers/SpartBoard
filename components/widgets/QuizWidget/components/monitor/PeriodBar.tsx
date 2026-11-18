import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
} from 'lucide-react';
import type { PeriodAccess, QuizSessionStatus } from '@/types';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
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
  /** A passed Manual due makes a live class late. */
  dueAt?: number | null;
  /** Live-tour anchors for the bar's controls. */
  anchors?: {
    select?: TourAnchorAttrs;
    start?: TourAnchorAttrs;
    pause?: TourAnchorAttrs;
    moreTime?: TourAnchorAttrs;
    extend?: TourAnchorAttrs;
  };
}

function useEntries(
  periodAccess: Record<string, PeriodAccess>,
  dueAt: number | null | undefined
) {
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
    late: dueAt != null && now >= dueAt,
  }));
}

const statusText = (
  access: PeriodAccess,
  state: EffectivePeriodState,
  late = false
) => {
  const pin = access.verified ? '' : ' · PIN';
  const live = late ? 'Late' : 'Live';
  if (state === 'open' && access.closeAt != null)
    return `${live} until ${formatClock(access.closeAt)}${pin}`;
  if (state === 'open' && late) return `Late${pin}`;
  if (state === 'scheduled' && access.openAt != null)
    return `Opens ${formatClock(access.openAt)}${pin}`;
  return `${STATE_LABEL[state]}${pin}`;
};

type Row = ReturnType<typeof useEntries>[number];

/** Class picker; each option carries its class's state, so the picked one reads at a glance. */
const PeriodPicker: React.FC<
  Pick<PeriodBarProps, 'selected' | 'onSelect' | 'anchors'> & { rows: Row[] }
> = ({ rows, selected, onSelect, anchors }) => {
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
        {...(anchors?.select ??
          tourTypeAttr('quiz-monitor.period-class-picker', 'quiz'))}
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        className="min-w-0 max-w-full rounded-md border border-brand-gray-lighter bg-white font-sans font-bold text-brand-blue-dark"
        style={{ ...text, padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)' }}
      >
        <option value="">All classes</option>
        {rows.map((r) => (
          <option key={r.key} value={r.key}>
            {r.access.label} · {statusText(r.access, r.state, r.late)}
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

/** Class picker for classes that share one Pause, with that shared state and its Pause or Resume. */
export const ClassPicker: React.FC<{
  names: string[];
  /** The class name shown, or '' for every class. */
  selected: string;
  onSelect: (name: string) => void;
  status: QuizSessionStatus;
  /** Pause or Resume for every class at once; omitted when the session can't be paused here. */
  onToggle?: () => Promise<void>;
  toggleAnchor?: TourAnchorAttrs;
  selectAnchor?: TourAnchorAttrs;
  /** Option labels for each class, when they differ from `names`. */
  labelFor?: (name: string) => string;
}> = ({
  names,
  selected,
  onSelect,
  status,
  onToggle,
  toggleAnchor,
  selectAnchor = tourTypeAttr('quiz-monitor.period-class-picker', 'quiz'),
  labelFor = (name) => name,
}) => {
  const [busy, setBusy] = useState(false);
  const paused = status === 'paused';
  const state = paused
    ? 'Paused'
    : status === 'waiting'
      ? 'Not started'
      : status === 'ended'
        ? 'Ended'
        : 'Live';
  const text = { fontSize: 'min(16px, 5.5cqmin)' };
  const toggle = async () => {
    if (!onToggle) return;
    setBusy(true);
    try {
      await onToggle();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="flex flex-wrap items-center justify-between"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      <div
        className="flex flex-wrap items-center min-w-0"
        style={{ gap: 'min(10px, 2.5cqmin)' }}
      >
        <select
          aria-label="Class"
          {...selectAnchor}
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="min-w-0 max-w-full rounded-md border border-brand-gray-lighter bg-white font-sans font-bold text-brand-blue-dark"
          style={{ ...text, padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)' }}
        >
          <option value="">All classes</option>
          {names.map((name) => (
            <option key={name} value={name}>
              {labelFor(name)} · {state}
            </option>
          ))}
        </select>
        {!selected && (
          <span
            className="whitespace-nowrap font-sans font-bold text-brand-blue-dark"
            style={text}
          >
            {state}
          </span>
        )}
      </div>
      {onToggle && (
        <button
          {...toggleAnchor}
          onClick={() => void toggle()}
          disabled={busy}
          className={`inline-flex items-center rounded-md font-sans font-semibold transition-colors disabled:opacity-60 ${
            paused
              ? 'bg-brand-blue-primary hover:bg-brand-blue-light text-white'
              : 'border border-brand-blue-primary/40 bg-white text-brand-blue-dark hover:bg-brand-blue-lighter'
          }`}
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
            fontSize: 'min(13px, 4.5cqmin)',
          }}
        >
          {busy ? (
            <Loader2 className="animate-spin" style={iconStyle} />
          ) : paused ? (
            <Play style={iconStyle} />
          ) : (
            <Pause style={iconStyle} />
          )}
          {paused ? 'Resume' : 'Pause'}
        </button>
      )}
    </div>
  );
};

const barButtonClass = (primary: boolean) =>
  `inline-flex items-center whitespace-nowrap rounded-md font-sans font-semibold transition-colors disabled:opacity-60 ${
    primary
      ? 'bg-brand-blue-primary hover:bg-brand-blue-light text-white'
      : 'border border-brand-blue-primary/40 bg-white text-brand-blue-dark hover:bg-brand-blue-lighter'
  }`;

const barButtonStyle = {
  gap: 'min(6px, 1.5cqmin)',
  padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
  fontSize: 'min(13px, 4.5cqmin)',
};

/** More time for a live class with a close time, and its +N min or Until I pause menu. */
const MoreTimeMenu: React.FC<{
  classLabel: string;
  extendMs: number;
  busy: boolean;
  onExtend: (by: number | null) => void;
  anchors?: { moreTime?: TourAnchorAttrs; extend?: TourAnchorAttrs };
}> = ({ classLabel, extendMs, busy, onExtend, anchors }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));
  return (
    <div ref={menuRef} className="relative flex">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        disabled={busy}
        aria-label={`More time for ${classLabel}`}
        aria-expanded={menuOpen}
        {...(anchors?.moreTime ??
          tourTypeAttr('quiz-monitor.period-more-time', 'quiz'))}
        className="inline-flex items-center rounded-md border border-brand-blue-primary/40 bg-white font-sans font-semibold text-brand-blue-dark hover:bg-brand-blue-lighter disabled:opacity-60"
        style={{
          gap: 'min(4px, 1cqmin)',
          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
          fontSize: 'min(13px, 4.5cqmin)',
        }}
      >
        More time
        <ChevronDown style={iconStyle} />
      </button>
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
              {...anchors?.extend}
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

/** Start or Pause for the picked class, plus More time while it has a close time. */
const PeriodAction: React.FC<
  Omit<PeriodBarProps, 'onSelect' | 'periodAccess'> & { rows: Row[] }
> = ({ rows, selected, onStart, onPause, onExtend, extendMs, anchors }) => {
  const [busy, setBusy] = useState(false);
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
    primary: boolean,
    anchor?: TourAnchorAttrs
  ) => (
    <button
      {...anchor}
      key={label}
      onClick={onClick}
      disabled={busy}
      className={barButtonClass(primary)}
      style={barButtonStyle}
    >
      {busy ? <Loader2 className="animate-spin" style={iconStyle} /> : icon}
      {label}
    </button>
  );

  if (!current) return null;

  const live = current.state === 'open';
  return (
    <div
      className="relative flex shrink-0"
      style={{ gap: 'min(6px, 1.5cqmin)' }}
    >
      {live && current.access.closeAt != null && (
        <MoreTimeMenu
          classLabel={current.access.label}
          extendMs={extendMs}
          busy={false}
          onExtend={(by) => void run(() => onExtend(current.key, by))}
          anchors={anchors}
        />
      )}
      {live
        ? button(
            'Pause',
            <Pause style={iconStyle} />,
            () => void run(() => onPause(current.key)),
            false,
            anchors?.pause
          )
        : button(
            'Start',
            <Play style={iconStyle} />,
            () => void run(() => onStart(current.key)),
            true,
            anchors?.start
          )}
    </div>
  );
};

/** One of the picked class's Open, Pause, Resume, Close or Reopen buttons (ASSIGNED_TAB.md D6). */
export interface AssignedBarAction {
  kind: 'open' | 'pause' | 'resume' | 'close' | 'reopen';
  label: string;
  primary: boolean;
  anchor?: TourAnchorAttrs;
  onClick: () => Promise<void>;
}

const ACTION_ICON: Record<AssignedBarAction['kind'], React.ElementType> = {
  open: Play,
  pause: Pause,
  resume: Play,
  close: Square,
  reopen: RotateCcw,
};

/** Class picker plus the picked class's own actions, for the Assigned tab's monitor (D7). */
export const AssignedClassBar: React.FC<{
  /** Omitted when there is only one class to show. */
  picker?: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    anchor?: TourAnchorAttrs;
  };
  actions: AssignedBarAction[];
  /** More time for the picked class while it is open with a close time. */
  moreTime?: {
    classLabel: string;
    extendMs: number;
    onExtend: (by: number | null) => Promise<void>;
    anchors?: { moreTime?: TourAnchorAttrs; extend?: TourAnchorAttrs };
  };
  disabled?: boolean;
  disabledTitle?: string;
}> = ({ picker, actions, moreTime, disabled = false, disabledTitle }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const text = { fontSize: 'min(16px, 5.5cqmin)' };
  if (!picker && actions.length === 0 && !moreTime) return null;
  return (
    <div
      className="flex flex-wrap items-center justify-between"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      {picker ? (
        <select
          aria-label="Class"
          {...(picker.anchor ??
            tourTypeAttr('quiz-monitor.period-class-picker', 'quiz'))}
          value={picker.value}
          onChange={(e) => picker.onChange(e.target.value)}
          className="min-w-0 max-w-full rounded-md border border-brand-gray-lighter bg-white font-sans font-bold text-brand-blue-dark"
          style={{ ...text, padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)' }}
        >
          {picker.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <span />
      )}
      <div
        className="flex flex-wrap items-center justify-end ml-auto"
        style={{ gap: 'min(6px, 1.5cqmin)' }}
      >
        {moreTime && (
          <MoreTimeMenu
            classLabel={moreTime.classLabel}
            extendMs={moreTime.extendMs}
            busy={busy != null || disabled}
            onExtend={(by) => void run('extend', () => moreTime.onExtend(by))}
            anchors={moreTime.anchors}
          />
        )}
        {actions.map((a) => {
          const Icon = ACTION_ICON[a.kind];
          return (
            <button
              key={a.kind}
              {...a.anchor}
              onClick={() => void run(a.kind, a.onClick)}
              disabled={busy != null || disabled}
              title={disabled ? disabledTitle : undefined}
              className={barButtonClass(a.primary)}
              style={barButtonStyle}
            >
              {busy === a.kind ? (
                <Loader2 className="animate-spin" style={iconStyle} />
              ) : (
                <Icon style={iconStyle} aria-hidden />
              )}
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Class picker and status with the picked class's Start or Pause, in one row. */
export const PeriodBar: React.FC<PeriodBarProps> = ({
  periodAccess,
  ...props
}) => {
  const rows = useEntries(periodAccess, props.dueAt);
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

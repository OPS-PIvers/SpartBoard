import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { TabExit } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import { useCloseOnHostResize } from './useCloseOnHostResize';
import {
  TAB_EXIT_STATUS_LABEL,
  describeTabExit,
  openTabExit,
  totalAwayMs,
} from '@/utils/tabExits';
import { formatAwayDuration } from '@/utils/tabAwayLimit';

interface TabExitsPopoverProps {
  exits: TabExit[] | undefined;
  warnings: number;
  studentName: string;
  completed: boolean;
  sessionEnded: boolean;
  /** The warning badge; becomes the button that opens the log. */
  children: React.ReactNode;
}

const PANEL_WIDTH = 340;

const formatClock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

/** Ticks once a second while an exit is still open. */
function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);
  return now;
}

export const TabExitLog: React.FC<
  Omit<TabExitsPopoverProps, 'children' | 'studentName'>
> = ({ exits, warnings, completed, sessionEnded }) => {
  const live = !completed && !sessionEnded && openTabExit(exits) !== null;
  const now = useNow(live);
  const rows = useMemo(
    () =>
      (exits ?? []).map((exit) =>
        describeTabExit(exit, { completed, sessionEnded, now })
      ),
    [exits, completed, sessionEnded, now]
  );

  if (rows.length === 0) {
    return (
      <p className="text-slate-600">
        Exit details weren&apos;t recorded for this attempt.
      </p>
    );
  }

  const unrecorded = warnings - rows.length;
  return (
    <>
      <table className="w-full text-left tabular-nums">
        <thead>
          <tr className="text-xs font-bold uppercase tracking-wider text-slate-500">
            <th className="py-1 pr-2 font-bold">#</th>
            <th className="py-1 pr-2 font-bold">Left at</th>
            <th className="py-1 pr-2 font-bold">On</th>
            <th className="py-1 pr-2 font-bold">Away</th>
            <th className="py-1 font-bold">Outcome</th>
          </tr>
        </thead>
        <tbody className="text-slate-800">
          {rows.map((row, i) => (
            <tr
              key={`${row.leftAt}-${i}`}
              className="border-t border-slate-100"
            >
              <td className="py-1 pr-2 text-slate-500">{i + 1}</td>
              <td className="py-1 pr-2 whitespace-nowrap">
                {formatClock(row.leftAt)}
              </td>
              <td className="py-1 pr-2">{row.on}</td>
              <td className="py-1 pr-2">
                {row.awayMs === null ? '—' : formatAwayDuration(row.awayMs)}
              </td>
              <td
                className={`py-1 ${
                  row.status === 'returned'
                    ? 'text-slate-600'
                    : 'font-semibold text-brand-red-dark'
                }`}
              >
                {TAB_EXIT_STATUS_LABEL[row.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 font-semibold text-slate-800">
        Total away: {formatAwayDuration(totalAwayMs(rows))}
      </p>
      {unrecorded > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {unrecorded} more {unrecorded === 1 ? 'exit was' : 'exits were'} not
          recorded.
        </p>
      )}
    </>
  );
};

/**
 * Makes a student's tab-warning count clickable, opening every exit with its
 * time away (docs/plans/shipped/TAB_AWAY_TIMER.md §2.6). Without the tab-away-timer
 * flag it renders the count unchanged.
 */
export const TabExitsPopover: React.FC<TabExitsPopoverProps> = ({
  children,
  studentName,
  ...logProps
}) => {
  const enabled =
    useContext(AuthContext)?.canAccessFeature?.('tab-away-timer') === true;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const ignoreRefs = useMemo(() => [panelRef], []);
  useClickOutside(wrapperRef, () => setOpen(false), ignoreRefs);
  useCloseOnHostResize(open, wrapperRef, () => setOpen(false));

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8)
    );
    setPos({ top: rect.bottom + 4, left });
  }, [open]);

  useEffect(() => {
    if (open && pos) panelRef.current?.focus();
  }, [open, pos]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!enabled) return <>{children}</>;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <span ref={wrapperRef} className="inline-flex shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Show when ${studentName} left`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
      >
        {children}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`Times ${studentName} left`}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              // Portalled to <body>: keep Escape away from DashboardView's handler.
              e.stopPropagation();
              close();
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: PANEL_WIDTH,
              maxWidth: 'calc(100vw - 16px)',
              zIndex: Z_INDEX.dropdown,
            }}
            className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg focus:outline-none"
          >
            <p className="mb-2 font-bold text-slate-800">
              {studentName} left {logProps.warnings}{' '}
              {logProps.warnings === 1 ? 'time' : 'times'}
            </p>
            <TabExitLog {...logProps} />
          </div>,
          document.body
        )}
    </span>
  );
};

/** Live "Away 0:23" for a student who is off the page right now. */
export const AwayNowChip: React.FC<{
  exits: TabExit[] | undefined;
  completed: boolean;
  sessionActive: boolean;
  style?: React.CSSProperties;
}> = ({ exits, completed, sessionActive, style }) => {
  const enabled =
    useContext(AuthContext)?.canAccessFeature?.('tab-away-timer') === true;
  const current = openTabExit(exits);
  const live = enabled && current !== null && !completed && sessionActive;
  const now = useNow(live);
  if (!live) return null;
  return (
    <span
      className="font-sans font-semibold text-brand-red-primary tabular-nums whitespace-nowrap"
      style={style}
    >
      Away {formatAwayDuration(now - current.leftAt)}
    </span>
  );
};

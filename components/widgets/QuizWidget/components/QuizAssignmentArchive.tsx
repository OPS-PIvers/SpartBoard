/**
 * QuizAssignmentArchive — displays assignment cards in two modes:
 *
 * **"active" mode** (In Progress tab): Shows active/paused assignments with
 * a context-aware primary action (Start / Resume / Monitor) and a compact
 * overflow menu for secondary actions.
 *
 * **"archive" mode** (Archive tab): Shows inactive assignments with muted
 * styling, primary action = Results, and a smaller overflow menu.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Link2,
  Monitor,
  BarChart3,
  Settings,
  Share2,
  Pause,
  PowerOff,
  Trash2,
  Calendar,
  Loader2,
  AlertTriangle,
  Inbox,
  MoreHorizontal,
  Radio,
  Rocket,
} from 'lucide-react';
import type { QuizAssignment } from '@/types';

/* ─── Props ───────────────────────────────────────────────────────────────── */

interface QuizAssignmentArchiveProps {
  assignments: QuizAssignment[];
  loading: boolean;
  /** Controls card styling & which primary action to show. */
  mode: 'active' | 'archive';
  onCopyUrl: (assignment: QuizAssignment) => void;
  onMonitor: (assignment: QuizAssignment) => void;
  /** Navigate to monitor for a never-started assignment (acts as "Start"). */
  onStart: (assignment: QuizAssignment) => void;
  onResults: (assignment: QuizAssignment) => void;
  onEditSettings: (assignment: QuizAssignment) => void;
  onShare: (assignment: QuizAssignment) => void;
  onPauseResume: (assignment: QuizAssignment) => void;
  onDeactivate: (assignment: QuizAssignment) => void;
  onDelete: (assignment: QuizAssignment) => void;
}

/* ─── Status styling ──────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<
  QuizAssignment['status'],
  { label: string; bg: string; fg: string; dot: string }
> = {
  active: {
    label: 'Live',
    bg: 'bg-emerald-100',
    fg: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  paused: {
    label: 'Paused',
    bg: 'bg-amber-100',
    fg: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  inactive: {
    label: 'Ended',
    bg: 'bg-slate-200',
    fg: 'text-slate-500',
    dot: 'bg-slate-400',
  },
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ─── Overflow menu (click-outside aware) ─────────────────────────────────── */

interface OverflowMenuProps {
  items: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
  }[];
}

const OverflowMenu: React.FC<OverflowMenuProps> = ({ items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center rounded-lg text-brand-blue-dark/60 hover:text-brand-blue-dark hover:bg-brand-blue-lighter/30 transition-colors"
        style={{
          width: 'min(28px, 7cqmin)',
          height: 'min(28px, 7cqmin)',
        }}
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal
          style={{
            width: 'min(16px, 4cqmin)',
            height: 'min(16px, 4cqmin)',
          }}
        />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-brand-blue-primary/15 py-1 z-50"
          style={{
            minWidth: 'min(160px, 40cqmin)',
            fontSize: 'min(11px, 3.25cqmin)',
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              disabled={item.disabled}
              className={`w-full flex items-center text-left font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                item.danger
                  ? 'text-brand-red-dark hover:bg-brand-red-lighter/30'
                  : 'text-brand-blue-dark hover:bg-brand-blue-lighter/30'
              }`}
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Main component ──────────────────────────────────────────────────────── */

export const QuizAssignmentArchive: React.FC<QuizAssignmentArchiveProps> = ({
  assignments,
  loading,
  mode,
  onCopyUrl,
  onMonitor,
  onStart,
  onResults,
  onEditSettings,
  onShare,
  onPauseResume,
  onDeactivate,
  onDelete,
}) => {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(
    null
  );

  const isActiveMode = mode === 'active';

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center flex-1 text-brand-blue-primary/60"
        style={{ gap: 'min(12px, 3cqmin)' }}
      >
        <Loader2
          className="animate-spin"
          style={{ width: 'min(28px, 7cqmin)', height: 'min(28px, 7cqmin)' }}
        />
        <span style={{ fontSize: 'min(12px, 3.5cqmin)' }}>
          Loading assignments…
        </span>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center flex-1 text-center text-brand-blue-primary/60"
        style={{ padding: 'min(24px, 6cqmin)', gap: 'min(10px, 2.5cqmin)' }}
      >
        <Inbox
          className="opacity-40"
          style={{ width: 'min(40px, 10cqmin)', height: 'min(40px, 10cqmin)' }}
        />
        <p
          className="font-semibold text-brand-blue-dark"
          style={{ fontSize: 'min(14px, 4.5cqmin)' }}
        >
          {isActiveMode ? 'No quizzes in progress' : 'No archived assignments'}
        </p>
        <p style={{ fontSize: 'min(12px, 3.5cqmin)', maxWidth: 320 }}>
          {isActiveMode
            ? 'Assign a quiz from the Library tab to get started. Active and paused assignments appear here.'
            : 'Ended assignments are moved here so you can review results and share them.'}
        </p>
      </div>
    );
  }

  const iconSize = {
    width: 'min(12px, 3cqmin)',
    height: 'min(12px, 3cqmin)',
  };

  return (
    <div
      className="flex-1 overflow-y-auto custom-scrollbar"
      style={{ padding: 'min(12px, 3cqmin)' }}
    >
      <div className="flex flex-col" style={{ gap: 'min(8px, 2cqmin)' }}>
        {assignments.map((a) => {
          const styles = STATUS_STYLES[a.status];
          const isActive = a.status === 'active';
          const isPaused = a.status === 'paused';
          const isInactive = a.status === 'inactive';
          const urlLive = isActive || isPaused;
          const isConfirmingDelete = confirmDelete === a.id;
          const isConfirmingDeactivate = confirmDeactivate === a.id;

          // Determine primary action for the card
          let primaryLabel: string;
          let primaryIcon: React.ReactNode;
          let primaryOnClick: () => void;
          let primaryClass: string;

          if (isActiveMode) {
            if (isActive) {
              primaryLabel = 'Monitor';
              primaryIcon = <Monitor style={iconSize} />;
              primaryOnClick = () => onMonitor(a);
              primaryClass =
                'bg-brand-blue-primary hover:bg-brand-blue-dark text-white';
            } else {
              // Paused — "Start" resumes the assignment and opens the monitor.
              primaryLabel = 'Start';
              primaryIcon = <Rocket style={iconSize} />;
              primaryOnClick = () => onStart(a);
              primaryClass = 'bg-emerald-600 hover:bg-emerald-700 text-white';
            }
          } else {
            // Archive mode — primary is Results
            primaryLabel = 'Results';
            primaryIcon = <BarChart3 style={iconSize} />;
            primaryOnClick = () => onResults(a);
            primaryClass =
              'bg-brand-blue-primary hover:bg-brand-blue-dark text-white';
          }

          // Build overflow menu items
          const menuItems: OverflowMenuProps['items'] = [];

          if (isActiveMode) {
            // In Progress overflow: Copy URL, Results, Settings, Share, Pause (if active), Make Inactive, Delete
            menuItems.push({
              label: 'Copy URL',
              icon: <Link2 style={iconSize} />,
              onClick: () => onCopyUrl(a),
              disabled: !urlLive,
            });
            if (isActive) {
              menuItems.push({
                label: 'Monitor',
                icon: <Monitor style={iconSize} />,
                onClick: () => onMonitor(a),
              });
            }
            menuItems.push({
              label: 'Results',
              icon: <BarChart3 style={iconSize} />,
              onClick: () => onResults(a),
            });
            menuItems.push({
              label: 'Settings',
              icon: <Settings style={iconSize} />,
              onClick: () => onEditSettings(a),
            });
            menuItems.push({
              label: 'Share',
              icon: <Share2 style={iconSize} />,
              onClick: () => onShare(a),
            });
            if (isActive) {
              menuItems.push({
                label: 'Pause',
                icon: <Pause style={iconSize} />,
                onClick: () => onPauseResume(a),
              });
            }
            menuItems.push({
              label: 'Make Inactive',
              icon: <PowerOff style={iconSize} />,
              onClick: () => setConfirmDeactivate(a.id),
              danger: true,
            });
            menuItems.push({
              label: 'Delete',
              icon: <Trash2 style={iconSize} />,
              onClick: () => setConfirmDelete(a.id),
              danger: true,
            });
          } else {
            // Archive overflow: Monitor (view-only), Settings, Share, Delete
            menuItems.push({
              label: 'Monitor',
              icon: <Monitor style={iconSize} />,
              onClick: () => onMonitor(a),
            });
            menuItems.push({
              label: 'Settings',
              icon: <Settings style={iconSize} />,
              onClick: () => onEditSettings(a),
            });
            menuItems.push({
              label: 'Share',
              icon: <Share2 style={iconSize} />,
              onClick: () => onShare(a),
            });
            menuItems.push({
              label: 'Delete',
              icon: <Trash2 style={iconSize} />,
              onClick: () => setConfirmDelete(a.id),
              danger: true,
            });
          }

          // Remove the primary action from the overflow menu to avoid duplication
          // by filtering out any menu item whose label matches the primary action.
          const filteredMenu = menuItems.filter(
            (m) => m.label !== primaryLabel
          );

          return (
            <div
              key={a.id}
              className={`rounded-xl border shadow-sm transition-shadow ${
                isInactive
                  ? 'bg-white/70 border-slate-200/60 opacity-70'
                  : isActive
                    ? 'bg-white border-emerald-200/60 hover:shadow-md'
                    : 'bg-white border-amber-200/60 hover:shadow'
              }`}
              style={{ padding: 'min(10px, 2.5cqmin)' }}
            >
              {/* Card header: title + metadata + status + actions */}
              <div
                className="flex items-center"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                {/* Live pulse for active assignments */}
                {isActive && (
                  <div
                    className="shrink-0 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                    style={{
                      width: 'min(8px, 2cqmin)',
                      height: 'min(8px, 2cqmin)',
                    }}
                  />
                )}
                {isPaused && (
                  <div
                    className="shrink-0 rounded-full bg-amber-400"
                    style={{
                      width: 'min(8px, 2cqmin)',
                      height: 'min(8px, 2cqmin)',
                    }}
                  />
                )}

                {/* Title + metadata */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`font-bold truncate ${isInactive ? 'text-slate-500' : 'text-brand-blue-dark'}`}
                    style={{ fontSize: 'min(13px, 4cqmin)' }}
                  >
                    {a.quizTitle}
                  </div>
                  <div
                    className={`flex items-center mt-0.5 ${isInactive ? 'text-slate-400' : 'text-brand-blue-primary/60'}`}
                    style={{
                      gap: 'min(8px, 2cqmin)',
                      fontSize: 'min(10px, 3cqmin)',
                    }}
                  >
                    {a.className && (
                      <span className="font-semibold truncate max-w-[80px]">
                        {a.className}
                      </span>
                    )}
                    <span className="flex items-center gap-0.5">
                      <Calendar
                        style={{
                          width: 'min(10px, 2.5cqmin)',
                          height: 'min(10px, 2.5cqmin)',
                        }}
                      />
                      {formatDate(a.createdAt)}
                    </span>
                    {urlLive && (
                      <span className="font-mono tracking-wider">{a.code}</span>
                    )}
                  </div>
                </div>

                {/* Status pill */}
                <div
                  className={`flex items-center gap-1 rounded-full ${styles.bg} ${styles.fg} font-bold uppercase tracking-wide shrink-0`}
                  style={{
                    padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
                    fontSize: 'min(9px, 2.5cqmin)',
                  }}
                >
                  {isActive && (
                    <Radio
                      style={{
                        width: 'min(9px, 2.25cqmin)',
                        height: 'min(9px, 2.25cqmin)',
                      }}
                    />
                  )}
                  {styles.label}
                </div>

                {/* Primary action */}
                <button
                  onClick={primaryOnClick}
                  className={`flex items-center shrink-0 font-bold rounded-lg transition-all active:scale-95 ${primaryClass}`}
                  style={{
                    gap: 'min(4px, 1cqmin)',
                    padding: 'min(5px, 1.25cqmin) min(10px, 2.5cqmin)',
                    fontSize: 'min(11px, 3.25cqmin)',
                  }}
                >
                  {primaryIcon}
                  {primaryLabel}
                </button>

                {/* Overflow menu */}
                <OverflowMenu items={filteredMenu} />
              </div>

              {/* Inline delete confirmation */}
              {isConfirmingDelete && (
                <div
                  className="mt-2 flex items-center justify-between bg-brand-red-lighter/40 border border-brand-red-primary/30 rounded-lg"
                  style={{
                    padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                    gap: 'min(6px, 1.5cqmin)',
                  }}
                >
                  <div
                    className="flex items-center gap-1.5 text-brand-red-dark"
                    style={{ fontSize: 'min(10px, 3cqmin)' }}
                  >
                    <AlertTriangle
                      style={{
                        width: 'min(12px, 3cqmin)',
                        height: 'min(12px, 3cqmin)',
                      }}
                    />
                    Delete assignment and all responses?
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded bg-white text-brand-blue-dark font-semibold border border-brand-blue-primary/20"
                      style={{
                        padding: 'min(3px, 0.75cqmin) min(8px, 2cqmin)',
                        fontSize: 'min(10px, 3cqmin)',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setConfirmDelete(null);
                        onDelete(a);
                      }}
                      className="rounded bg-brand-red-primary text-white font-bold"
                      style={{
                        padding: 'min(3px, 0.75cqmin) min(8px, 2cqmin)',
                        fontSize: 'min(10px, 3cqmin)',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Inline deactivate confirmation */}
              {isConfirmingDeactivate && (
                <div
                  className="mt-2 flex items-center justify-between bg-amber-50 border border-amber-300 rounded-lg"
                  style={{
                    padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                    gap: 'min(6px, 1.5cqmin)',
                  }}
                >
                  <div
                    className="flex items-center gap-1.5 text-amber-900"
                    style={{ fontSize: 'min(10px, 3cqmin)' }}
                  >
                    <AlertTriangle
                      style={{
                        width: 'min(12px, 3cqmin)',
                        height: 'min(12px, 3cqmin)',
                      }}
                    />
                    The join URL will stop working. Responses are preserved.
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setConfirmDeactivate(null)}
                      className="rounded bg-white text-brand-blue-dark font-semibold border border-brand-blue-primary/20"
                      style={{
                        padding: 'min(3px, 0.75cqmin) min(8px, 2cqmin)',
                        fontSize: 'min(10px, 3cqmin)',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setConfirmDeactivate(null);
                        onDeactivate(a);
                      }}
                      className="rounded bg-amber-600 text-white font-bold"
                      style={{
                        padding: 'min(3px, 0.75cqmin) min(8px, 2cqmin)',
                        fontSize: 'min(10px, 3cqmin)',
                      }}
                    >
                      Make Inactive
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

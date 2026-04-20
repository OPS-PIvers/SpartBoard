/**
 * AssignmentArchiveCard — one card per assignment in the In Progress /
 * Archive tabs.
 *
 * Generalizes `QuizAssignmentArchive`'s row rendering: status badge,
 * title + subtitle, optional meta line, primary action button, and an
 * overflow menu (MoreHorizontal) surfacing secondary actions.
 *
 * Two visual modes:
 *   - `'active'`: full-colour styling for live/paused assignments.
 *   - `'archive'`: muted styling for ended assignments.
 *
 * The primitive is status-agnostic — the consumer resolves the
 * assignment's status into an `AssignmentStatusBadge` (label + tone +
 * optional dot) and passes it in. Tone → colour mapping follows the
 * shared `LibraryBadgeTone` convention.
 */

import React, { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import type {
  AssignmentArchiveCardProps,
  LibraryBadgeTone,
  LibraryMenuAction,
} from './types';

/* ─── Tone → styling ──────────────────────────────────────────────────────── */

interface ToneStyles {
  badgeBg: string;
  badgeFg: string;
  dot: string;
  activeBorder: string;
}

const TONE_STYLES: Record<LibraryBadgeTone, ToneStyles> = {
  success: {
    badgeBg: 'bg-emerald-100',
    badgeFg: 'text-emerald-700',
    dot: 'bg-emerald-500',
    activeBorder: 'border-emerald-200/60 hover:shadow-md',
  },
  warn: {
    badgeBg: 'bg-amber-100',
    badgeFg: 'text-amber-700',
    dot: 'bg-amber-500',
    activeBorder: 'border-amber-200/60 hover:shadow',
  },
  neutral: {
    badgeBg: 'bg-slate-200',
    badgeFg: 'text-slate-500',
    dot: 'bg-slate-400',
    activeBorder: 'border-slate-200/60 hover:shadow',
  },
  info: {
    badgeBg: 'bg-blue-100',
    badgeFg: 'text-blue-700',
    dot: 'bg-blue-500',
    activeBorder: 'border-blue-200/60 hover:shadow',
  },
  danger: {
    badgeBg: 'bg-red-100',
    badgeFg: 'text-red-700',
    dot: 'bg-red-500',
    activeBorder: 'border-red-200/60 hover:shadow',
  },
};

/* ─── OverflowMenu (reused pattern from QuizAssignmentArchive) ────────────── */

interface OverflowMenuProps {
  actions: LibraryMenuAction[];
}

const OverflowMenu: React.FC<OverflowMenuProps> = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  if (actions.length === 0) return null;

  // Sort destructive actions to the bottom while preserving caller order
  // within each bucket.
  const normalActions = actions.filter((a) => !a.destructive);
  const destructiveActions = actions.filter((a) => a.destructive);
  const orderedActions = [...normalActions, ...destructiveActions];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-7 h-7 rounded-lg text-brand-blue-dark/60 hover:text-brand-blue-dark hover:bg-brand-blue-lighter/30 transition-colors"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[160px] bg-white rounded-lg shadow-lg border border-brand-blue-primary/15 py-1 z-50"
        >
          {orderedActions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onClick();
                }}
                disabled={item.disabled}
                title={item.disabled ? item.disabledReason : undefined}
                className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  item.destructive
                    ? 'text-brand-red-dark hover:bg-brand-red-lighter/30'
                    : 'text-brand-blue-dark hover:bg-brand-blue-lighter/30'
                }`}
              >
                {Icon && <Icon size={12} className="shrink-0" />}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ─── Main component ──────────────────────────────────────────────────────── */

export function AssignmentArchiveCard<TAssignment>({
  mode,
  status,
  primaryAction,
  secondaryActions,
  meta,
  title,
  subtitle,
}: AssignmentArchiveCardProps<TAssignment>): React.ReactElement {
  const tone = TONE_STYLES[status.tone];
  const isArchive = mode === 'archive';

  const PrimaryIcon = primaryAction.icon;

  const cardClass = isArchive
    ? 'bg-white/70 border-slate-200/60 opacity-70'
    : `bg-white ${tone.activeBorder}`;

  const titleClass = isArchive ? 'text-slate-500' : 'text-brand-blue-dark';
  const metaClass = isArchive ? 'text-slate-400' : 'text-brand-blue-primary/60';

  return (
    <div
      className={`rounded-xl border shadow-sm transition-shadow p-2.5 ${cardClass}`}
    >
      <div className="flex items-center gap-2">
        {/* Status dot (live pulse / paused static dot) */}
        {status.dot && !isArchive && (
          <div
            className={`shrink-0 w-2 h-2 rounded-full ${tone.dot} ${
              status.tone === 'success'
                ? 'animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                : ''
            }`}
            aria-hidden="true"
          />
        )}

        {/* Title + subtitle + meta */}
        <div className="flex-1 min-w-0">
          <div
            className={`font-bold text-sm truncate ${titleClass}`}
            title={title}
          >
            {title}
          </div>
          <div
            className={`flex items-center gap-2 mt-0.5 text-xs ${metaClass}`}
          >
            {subtitle !== undefined && subtitle !== null && (
              <span className="font-semibold truncate max-w-[120px]">
                {subtitle}
              </span>
            )}
            {meta !== undefined && meta !== null && (
              <span className="flex items-center gap-2 min-w-0">{meta}</span>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div
          data-testid="assignment-status-badge"
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide shrink-0 ${tone.badgeBg} ${tone.badgeFg}`}
        >
          {status.label}
        </div>

        {/* Primary action */}
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
          title={
            primaryAction.disabled ? primaryAction.disabledReason : undefined
          }
          className="flex items-center gap-1 shrink-0 px-2.5 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xs font-bold rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {PrimaryIcon && <PrimaryIcon size={12} className="shrink-0" />}
          <span>{primaryAction.label}</span>
        </button>

        {/* Overflow menu */}
        {secondaryActions && secondaryActions.length > 0 && (
          <OverflowMenu actions={secondaryActions} />
        )}
      </div>
    </div>
  );
}

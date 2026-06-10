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

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
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
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click — covers both the trigger wrapper and the
  // portalled menu, so clicks inside the menu don't close it. Memoized
  // so `useClickOutside` doesn't re-subscribe DOM listeners every render.
  const ignoreRefs = useMemo(() => [menuRef], []);
  useClickOutside(wrapperRef, () => setOpen(false), ignoreRefs);

  // Measure trigger position when the menu opens so the portal renders
  // flush under it. `opacity-70` on archive cards creates a stacking
  // context that traps absolute-positioned children, hence the portal.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  // Close the menu if the page scrolls or resizes (portal position is
  // fixed at open time; staying open after layout shifts looks broken).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (actions.length === 0) return null;

  // Sort destructive actions to the bottom while preserving caller order
  // within each bucket.
  const normalActions = actions.filter((a) => !a.destructive);
  const destructiveActions = actions.filter((a) => a.destructive);
  const orderedActions = [...normalActions, ...destructiveActions];

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center rounded-lg text-brand-blue-dark/60 hover:text-brand-blue-dark hover:bg-brand-blue-lighter/30 transition-colors"
        style={{
          width: 'min(30px, 8cqmin)',
          height: 'min(30px, 8cqmin)',
        }}
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal
          style={{
            width: 'min(16px, 4.5cqmin)',
            height: 'min(16px, 4.5cqmin)',
          }}
        />
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              zIndex: 60,
            }}
            className="min-w-[160px] bg-white rounded-lg shadow-lg border border-brand-blue-primary/15 py-1"
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
          </div>,
          document.body
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

  const PrimaryIcon = primaryAction?.icon;

  // Slim list-row styling: hairline-separated rows with a hover surface
  // instead of stacked bordered cards. Archive rows are muted (opacity-70)
  // and recover full opacity on hover so actions stay easy to read.
  const cardClass = isArchive
    ? 'opacity-70 hover:opacity-100'
    : 'hover:bg-white/60';

  const titleClass = isArchive ? 'text-slate-500' : 'text-brand-blue-dark';
  const metaClass = isArchive ? 'text-slate-400' : 'text-brand-blue-primary/60';

  return (
    <div
      className={`group rounded-lg border-b border-slate-200/60 last:border-b-0 transition-colors ${cardClass}`}
      style={{
        padding: 'min(10px, 2.2cqmin) min(12px, 2.6cqmin)',
      }}
    >
      <div className="flex items-center" style={{ gap: 'min(10px, 2.2cqmin)' }}>
        {/* Status dot (live pulse / paused static dot). The slot is always
            reserved so titles line up vertically across rows regardless of
            whether a given row has a dot. */}
        <div
          className="flex shrink-0 items-center justify-center"
          style={{ width: 'min(8px, 2cqmin)' }}
          aria-hidden="true"
        >
          {status.dot && !isArchive && (
            <div
              className={`rounded-full ${tone.dot} ${
                status.tone === 'success'
                  ? 'animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                  : ''
              }`}
              style={{
                width: 'min(8px, 2cqmin)',
                height: 'min(8px, 2cqmin)',
              }}
            />
          )}
        </div>

        {/* Title + subtitle + meta */}
        <div className="flex-1 min-w-0">
          <div
            className={`font-bold truncate ${titleClass}`}
            style={{ fontSize: 'min(14px, 4.2cqmin)' }}
            title={title}
          >
            {title}
          </div>
          <div
            className={`flex items-center mt-0.5 min-w-0 overflow-hidden ${metaClass}`}
            style={{
              gap: 'min(8px, 2cqmin)',
              fontSize: 'min(12px, 3.5cqmin)',
            }}
          >
            {subtitle !== undefined && subtitle !== null && (
              <span className="font-semibold truncate min-w-0">{subtitle}</span>
            )}
            {meta !== undefined && meta !== null && (
              <span
                className="flex items-center min-w-0 overflow-hidden whitespace-nowrap"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                {meta}
              </span>
            )}
          </div>
        </div>

        {/* Status badge — fixed minimum width and centered text so the
            badge column reads as a column even when labels differ in
            length (Live / Paused / Shared / Ended). */}
        <div
          data-testid="assignment-status-badge"
          className={`flex items-center justify-center rounded-full font-bold uppercase tracking-wide shrink-0 ${tone.badgeBg} ${tone.badgeFg}`}
          style={{
            gap: 'min(4px, 1cqmin)',
            minWidth: 'min(60px, 14cqmin)',
            paddingInline: 'min(8px, 2cqmin)',
            paddingBlock: 'min(2px, 0.6cqmin)',
            fontSize: 'min(10px, 3cqmin)',
          }}
        >
          {status.label}
        </div>

        {/* Primary action — omitted on archived view-only cards where the
            link is dead and a Copy button would be misleading. The wrapper
            is `relative` so an optional badge can absolutely-position over
            the top-right corner without disturbing the button's own layout. */}
        {primaryAction && (
          <div
            className="relative shrink-0"
            style={{ minWidth: 'min(96px, 23cqmin)' }}
          >
            <button
              type="button"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              title={
                primaryAction.disabled
                  ? primaryAction.disabledReason
                  : undefined
              }
              className="flex w-full items-center justify-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                paddingInline: 'min(10px, 2.4cqmin)',
                paddingBlock: 'min(5px, 1.2cqmin)',
                fontSize: 'min(12px, 3.5cqmin)',
              }}
            >
              {PrimaryIcon && (
                <PrimaryIcon
                  className="shrink-0"
                  style={{
                    width: 'min(13px, 3.8cqmin)',
                    height: 'min(13px, 3.8cqmin)',
                  }}
                />
              )}
              <span>{primaryAction.label}</span>
              {/* Screen-reader copy of the badge count — the visible pill is a
                  sibling of the button (so it can render *outside* the button's
                  layout bounds) and therefore isn't part of the button's
                  accessible name. This sr-only node appends the count to the
                  label so a focused screen reader hears "Monitor, 3 students
                  locked" rather than just "Monitor". */}
              {typeof primaryAction.badgeCount === 'number' &&
                primaryAction.badgeCount > 0 && (
                  <span className="sr-only">
                    {', '}
                    {primaryAction.badgeAriaLabel ??
                      `${primaryAction.badgeCount} item${primaryAction.badgeCount === 1 ? '' : 's'} need attention`}
                  </span>
                )}
            </button>
            {typeof primaryAction.badgeCount === 'number' &&
              primaryAction.badgeCount > 0 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-1 ring-white"
                >
                  {primaryAction.badgeCount}
                </span>
              )}
          </div>
        )}

        {/* Overflow menu — a same-width spacer is reserved when a row has
            no kebab so the primary-action column stays vertically aligned
            with sibling rows that do. */}
        {secondaryActions && secondaryActions.length > 0 ? (
          <OverflowMenu actions={secondaryActions} />
        ) : (
          <div
            aria-hidden="true"
            className="shrink-0"
            style={{ width: 'min(30px, 8cqmin)' }}
          />
        )}
      </div>
    </div>
  );
}

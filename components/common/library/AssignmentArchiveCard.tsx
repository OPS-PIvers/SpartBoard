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

import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { OverflowMenu } from './LibraryOverflowMenu';
import type { AssignmentArchiveCardProps, LibraryBadgeTone } from './types';

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
    activeBorder: 'border-amber-200/60 hover:shadow-sm',
  },
  neutral: {
    badgeBg: 'bg-slate-200',
    badgeFg: 'text-slate-500',
    dot: 'bg-slate-400',
    activeBorder: 'border-slate-200/60 hover:shadow-sm',
  },
  info: {
    badgeBg: 'bg-blue-100',
    badgeFg: 'text-blue-700',
    dot: 'bg-blue-500',
    activeBorder: 'border-blue-200/60 hover:shadow-sm',
  },
  danger: {
    badgeBg: 'bg-red-100',
    badgeFg: 'text-red-700',
    dot: 'bg-red-500',
    activeBorder: 'border-red-200/60 hover:shadow-sm',
  },
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
  tourIndex,
  tourWidgetType,
}: AssignmentArchiveCardProps<TAssignment>): React.ReactElement {
  const tone = TONE_STYLES[status.tone];
  const isArchive = mode === 'archive';
  const tourRowKey = tourIndex != null ? `row-${tourIndex + 1}` : undefined;
  const tourWidgetTypeResolved = tourWidgetType ?? 'library';

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
              {...(primaryAction.anchor ??
                (tourRowKey
                  ? tourFieldAttr(
                      'library-shell.archive-primary-action',
                      tourWidgetTypeResolved,
                      tourRowKey
                    )
                  : {}))}
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
                  className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-xs ring-1 ring-white"
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
          <OverflowMenu
            actions={secondaryActions}
            rowKey={tourRowKey}
            widgetType={tourWidgetTypeResolved}
            archive
          />
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

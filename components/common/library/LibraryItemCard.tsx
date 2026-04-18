/**
 * LibraryItemCard — generic sortable card for the unified Library system.
 *
 * Implements `LibraryItemCardProps<TMeta>` from ./types. Wraps dnd-kit's
 * `useSortable` when `sortable !== false && !isDragOverlay`, otherwise renders
 * a static card (used for the floating `DragOverlay`). Card body click routes
 * to `onClick`; drag starts from a dedicated grip handle so body clicks are
 * unambiguous.
 *
 * Visual style matches the QuizManager light interior — white surface with
 * slate border, rounded-2xl, brand-blue accents on primary action, and a
 * click-outside overflow menu (MoreHorizontal) for secondary actions.
 *
 * When the parent `LibraryGrid` locks reordering (search active or non-manual
 * sort) it passes a hint through `LibraryGridLockContext`; cards surface the
 * hint as the drag-handle tooltip at reduced opacity.
 */

import React, { useContext, useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import { LibraryGridLockContext } from './LibraryGridLockContext';
import type {
  LibraryBadge,
  LibraryBadgeTone,
  LibraryItemCardProps,
  LibraryMenuAction,
} from './types';

/* ─── Badge tone styles ───────────────────────────────────────────────────── */

const BADGE_TONE_STYLES: Record<
  LibraryBadgeTone,
  { bg: string; fg: string; dot: string }
> = {
  neutral: { bg: 'bg-slate-100', fg: 'text-slate-600', dot: 'bg-slate-400' },
  info: {
    bg: 'bg-brand-blue-lighter/40',
    fg: 'text-brand-blue-dark',
    dot: 'bg-brand-blue-primary',
  },
  warn: { bg: 'bg-amber-100', fg: 'text-amber-700', dot: 'bg-amber-500' },
  success: {
    bg: 'bg-emerald-100',
    fg: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  danger: {
    bg: 'bg-brand-red-lighter/40',
    fg: 'text-brand-red-dark',
    dot: 'bg-brand-red-primary',
  },
};

/* ─── Inline action buttons ──────────────────────────────────────────────── */

interface InlineActionButtonProps {
  action: LibraryMenuAction;
  compact?: boolean;
}

const InlineActionButton: React.FC<InlineActionButtonProps> = ({
  action,
  compact = false,
}) => {
  const Icon = action.icon;
  const destructive = action.destructive;
  const base =
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border font-bold uppercase tracking-wider transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';
  const tone = destructive
    ? 'border-brand-red-primary/20 bg-white/80 text-brand-red-dark hover:bg-brand-red-lighter/30 hover:border-brand-red-primary/40'
    : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-white hover:border-slate-300';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!action.disabled) action.onClick();
      }}
      disabled={action.disabled}
      title={action.disabled ? action.disabledReason : action.label}
      aria-label={action.label}
      className={`${base} ${tone}`}
      style={{
        paddingInline: compact ? '0' : 'min(12px, 2.8cqmin)',
        paddingBlock: 'min(6px, 1.6cqmin)',
        fontSize: 'min(11px, 3.6cqmin)',
        minWidth: compact ? 'min(32px, 9cqmin)' : undefined,
        height: compact ? 'min(32px, 9cqmin)' : undefined,
      }}
    >
      {Icon && (
        <Icon
          style={{
            width: 'min(14px, 4cqmin)',
            height: 'min(14px, 4cqmin)',
          }}
          className="shrink-0"
        />
      )}
      {!compact && <span className="truncate">{action.label}</span>}
    </button>
  );
};

/* ─── Overflow menu (click-outside aware) ─────────────────────────────────── */

interface OverflowMenuProps {
  actions: LibraryMenuAction[];
}

const OverflowMenu: React.FC<OverflowMenuProps> = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false));

  if (actions.length === 0) return null;

  // Destructive actions float to the bottom to mirror the Quiz pattern.
  const ordered = [...actions].sort((a, b) => {
    if (a.destructive === b.destructive) return 0;
    return a.destructive ? 1 : -1;
  });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        style={{
          width: 'min(32px, 9cqmin)',
          height: 'min(32px, 9cqmin)',
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
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[176px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {ordered.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (!item.disabled) item.onClick();
                }}
                disabled={item.disabled}
                title={item.disabled ? item.disabledReason : undefined}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.destructive
                    ? 'text-brand-red-dark hover:bg-brand-red-lighter/30'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {Icon && <Icon size={14} className="shrink-0" />}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ─── Badge chip ──────────────────────────────────────────────────────────── */

const BadgeChip: React.FC<{ badge: LibraryBadge }> = ({ badge }) => {
  const tone = BADGE_TONE_STYLES[badge.tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${tone.bg} ${tone.fg}`}
    >
      {badge.dot && (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
          aria-hidden="true"
        />
      )}
      {badge.label}
    </span>
  );
};

/* ─── Inner card body (presentation only — no dnd-kit coupling) ───────────── */

interface CardBodyProps<TMeta> extends LibraryItemCardProps<TMeta> {
  dragHandle?: React.ReactNode;
  isDragging?: boolean;
}

function CardBody<TMeta>(props: CardBodyProps<TMeta>) {
  const {
    title,
    subtitle,
    thumbnail,
    badges,
    primaryAction,
    secondaryActions,
    onClick,
    viewMode = 'grid',
    dragHandle,
    isDragOverlay,
    isDragging,
  } = props;

  const PrimaryIcon = primaryAction.icon;
  const isList = viewMode === 'list';

  // Inline-vs-overflow layout only applies to list-view cards with secondary
  // actions. Grid-view cards always use the overflow menu, so we skip the
  // ResizeObserver entirely there (avoids per-card observer overhead in large
  // libraries).
  const secondaryCount = secondaryActions?.length ?? 0;
  const shouldMeasureSecondaryActions = isList && secondaryCount > 0;

  const cardRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!shouldMeasureSecondaryActions) return undefined;
    const el = cardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setCardWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldMeasureSecondaryActions]);

  // When we've flipped out of the measuring mode (e.g. view mode changed from
  // list to grid, or secondary actions got removed), ignore the stale
  // measurement so grid cards reliably fall back to the overflow menu.
  const effectiveCardWidth = shouldMeasureSecondaryActions ? cardWidth : null;

  // Rough space budget per inline secondary: ~92px with label, ~40px icon-only.
  // Primary (ASSIGN) plus padding eats ~140px. Inline labels when we have
  // headroom; otherwise try icon-only; otherwise fall back to overflow menu.
  const widthForLabels = 160 + secondaryCount * 96;
  const widthForIconOnly = 160 + secondaryCount * 44;
  const canShowInlineLabels =
    effectiveCardWidth != null && effectiveCardWidth >= widthForLabels;
  const canShowInlineIcons =
    effectiveCardWidth != null && effectiveCardWidth >= widthForIconOnly;
  const useOverflowMenu = !canShowInlineLabels && !canShowInlineIcons;

  const handleBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore bubbled events from buttons / links / menus inside the card.
    if ((e.target as HTMLElement).closest('button, a, [role="menu"]')) return;
    onClick?.();
  };

  return (
    <div
      ref={cardRef}
      onClick={onClick ? handleBodyClick : undefined}
      className={[
        'group relative flex rounded-2xl border border-slate-200/80 bg-white/70 backdrop-blur-sm text-slate-700 shadow-sm transition-shadow hover:shadow-md hover:bg-white/85',
        isList ? 'flex-row items-center' : 'flex-col',
        onClick && 'cursor-pointer',
        isDragging && 'opacity-50',
        isDragOverlay &&
          'pointer-events-none ring-2 ring-brand-blue-primary/30',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        gap: isList ? 'min(12px, 3cqmin)' : 'min(12px, 3cqmin)',
        padding: isList ? 'min(12px, 2.8cqmin)' : 'min(16px, 3.5cqmin)',
      }}
      aria-hidden={isDragOverlay}
    >
      {/* Drag handle (left edge) */}
      {dragHandle}

      {/* Thumbnail */}
      {thumbnail && (
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50/60"
          style={
            isList
              ? {
                  width: 'min(48px, 13cqmin)',
                  height: 'min(48px, 13cqmin)',
                }
              : {
                  width: '100%',
                  height: 'min(96px, 26cqmin)',
                }
          }
        >
          {thumbnail}
        </div>
      )}

      {/* Main body */}
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={{ gap: 'min(4px, 1cqmin)' }}
      >
        <h3
          className="truncate font-black text-slate-800"
          style={{
            fontSize: isList ? 'min(14px, 4.5cqmin)' : 'min(15px, 4.8cqmin)',
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <div
            className="truncate font-medium text-slate-500"
            style={{ fontSize: 'min(12px, 3.8cqmin)' }}
          >
            {subtitle}
          </div>
        )}
        {badges && badges.length > 0 && (
          <div
            className="mt-1 flex flex-wrap items-center"
            style={{ gap: 'min(6px, 1.5cqmin)' }}
          >
            {badges.map((b, i) => (
              <BadgeChip key={`${b.label}-${i}`} badge={b} />
            ))}
          </div>
        )}
      </div>

      {/* Actions (right side) */}
      <div
        className={`flex shrink-0 items-center ${isList ? '' : 'self-end'}`}
        style={{ gap: 'min(6px, 1.5cqmin)' }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!primaryAction.disabled) primaryAction.onClick();
          }}
          disabled={primaryAction.disabled}
          title={
            primaryAction.disabled
              ? primaryAction.disabledReason
              : primaryAction.label
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-blue-primary font-bold uppercase tracking-widest text-white shadow-sm transition-all hover:bg-brand-blue-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-blue-primary"
          style={{
            paddingInline: 'min(14px, 3.2cqmin)',
            paddingBlock: 'min(6px, 1.6cqmin)',
            fontSize: 'min(12px, 3.8cqmin)',
          }}
        >
          {PrimaryIcon && (
            <PrimaryIcon
              style={{
                width: 'min(14px, 4cqmin)',
                height: 'min(14px, 4cqmin)',
              }}
            />
          )}
          {primaryAction.label}
        </button>
        {secondaryActions && secondaryActions.length > 0 && (
          <>
            {useOverflowMenu ? (
              <OverflowMenu actions={secondaryActions} />
            ) : (
              secondaryActions.map((action) => (
                <InlineActionButton
                  key={action.id}
                  action={action}
                  compact={!canShowInlineLabels}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */

export function LibraryItemCard<TMeta = unknown>(
  props: LibraryItemCardProps<TMeta>
) {
  const { sortable = true, isDragOverlay = false } = props;
  const lockState = useContext(LibraryGridLockContext);

  // When used inside the floating DragOverlay, or when sorting is disabled
  // at either card or grid level, render a static card without useSortable.
  const canSort = sortable && !isDragOverlay && !lockState.dragDisabled;

  if (!canSort) {
    return <CardBody {...props} />;
  }

  return <SortableCard {...props} lockedReason={lockState.reason} />;
}

/* ─── Sortable wrapper (separate to keep hook call conditional-safe) ──────── */

interface SortableCardProps<TMeta> extends LibraryItemCardProps<TMeta> {
  lockedReason?: string;
}

function SortableCard<TMeta>(props: SortableCardProps<TMeta>) {
  const { id, lockedReason } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: Boolean(lockedReason) });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? Z_INDEX.itemDragging : undefined,
  };

  const dragHandle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      disabled={Boolean(lockedReason)}
      title={lockedReason ?? 'Drag to reorder'}
      aria-label={lockedReason ?? 'Drag to reorder'}
      className={`flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing touch-none disabled:cursor-not-allowed ${
        lockedReason ? 'opacity-40' : ''
      }`}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      <CardBody {...props} dragHandle={dragHandle} isDragging={isDragging} />
    </div>
  );
}

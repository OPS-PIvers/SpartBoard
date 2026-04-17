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

import React, { useContext, useRef, useState } from 'react';
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
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
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

  const handleBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore bubbled events from buttons / links / menus inside the card.
    if ((e.target as HTMLElement).closest('button, a, [role="menu"]')) return;
    onClick?.();
  };

  return (
    <div
      onClick={onClick ? handleBodyClick : undefined}
      className={[
        'group relative flex rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-shadow hover:shadow-md',
        isList ? 'flex-row items-center gap-3 p-3' : 'flex-col gap-3 p-4',
        onClick && 'cursor-pointer',
        isDragging && 'opacity-50',
        isDragOverlay &&
          'pointer-events-none ring-2 ring-brand-blue-primary/30',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden={isDragOverlay}
    >
      {/* Drag handle (left edge) */}
      {dragHandle}

      {/* Thumbnail */}
      {thumbnail && (
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 ${
            isList ? 'h-12 w-12' : 'h-24 w-full'
          }`}
        >
          {thumbnail}
        </div>
      )}

      {/* Main body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3
          className={`truncate font-black text-slate-800 ${
            isList ? 'text-sm' : 'text-[15px]'
          }`}
        >
          {title}
        </h3>
        {subtitle && (
          <div className="truncate text-xs font-medium text-slate-500">
            {subtitle}
          </div>
        )}
        {badges && badges.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {badges.map((b, i) => (
              <BadgeChip key={`${b.label}-${i}`} badge={b} />
            ))}
          </div>
        )}
      </div>

      {/* Actions (right side) */}
      <div
        className={`flex shrink-0 items-center gap-1 ${
          isList ? '' : 'self-end'
        }`}
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
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-blue-primary px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white shadow-sm transition-all hover:bg-brand-blue-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-blue-primary"
        >
          {PrimaryIcon && <PrimaryIcon size={14} />}
          {primaryAction.label}
        </button>
        {secondaryActions && secondaryActions.length > 0 && (
          <OverflowMenu actions={secondaryActions} />
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

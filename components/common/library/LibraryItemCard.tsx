/**
 * LibraryItemCard — generic sortable card for the unified Library system.
 *
 * Implements `LibraryItemCardProps<TMeta>` from ./types. Wraps dnd-kit's
 * `useSortable` when `sortable !== false && !isDragOverlay`, otherwise renders
 * a static card (used for the floating `DragOverlay`). The whole card is the
 * drag activator so the `DragOverlay` clone tracks the cursor naturally;
 * `PointerSensor`'s 5px activation distance keeps body clicks unambiguous.
 * The left-edge grip is a visual affordance only.
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
import { Check, GripVertical, MoreHorizontal } from 'lucide-react';
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
    selectionMode,
    selected,
    onSelectionToggle,
  } = props;

  const PrimaryIcon = primaryAction.icon;
  const isList = viewMode === 'list';

  const handleBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore bubbled events from buttons / links / menus inside the card.
    if ((e.target as HTMLElement).closest('button, a, [role="menu"]')) return;
    if (selectionMode) {
      onSelectionToggle?.();
      return;
    }
    onClick?.();
  };

  return (
    <div
      onClick={(onClick ?? selectionMode) ? handleBodyClick : undefined}
      className={[
        'group relative flex rounded-2xl border backdrop-blur-sm text-slate-700 shadow-sm transition-shadow hover:shadow-md',
        selectionMode && selected
          ? 'border-brand-blue-primary/60 bg-brand-blue-lighter/30 hover:bg-brand-blue-lighter/40 ring-2 ring-brand-blue-primary/30'
          : 'border-slate-200/80 bg-white/70 hover:bg-white/85',
        isList ? 'flex-row items-center' : 'flex-col',
        (onClick ?? selectionMode) && 'cursor-pointer',
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
      {/* Selection checkbox (left edge, rendered before drag handle) */}
      {selectionMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectionToggle?.();
          }}
          role="checkbox"
          aria-checked={!!selected}
          aria-label={selected ? `Deselect ${title}` : `Select ${title}`}
          className={`flex shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
            selected
              ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
              : 'border-slate-300 bg-white hover:border-brand-blue-primary/70'
          }`}
          style={{
            width: 'min(20px, 5.5cqmin)',
            height: 'min(20px, 5.5cqmin)',
          }}
        >
          {selected && (
            <Check
              style={{
                width: 'min(14px, 4cqmin)',
                height: 'min(14px, 4cqmin)',
              }}
              strokeWidth={3}
            />
          )}
        </button>
      )}

      {/* Drag handle (left edge) — hidden in selection mode */}
      {!selectionMode && dragHandle}

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
  const { sortable = true, isDragOverlay = false, selectionMode } = props;
  const lockState = useContext(LibraryGridLockContext);

  // When used inside the floating DragOverlay, or when sorting is disabled
  // at either card or grid level (or the user is in selection mode), render
  // a static card without useSortable.
  const canSort =
    sortable && !isDragOverlay && !lockState.dragDisabled && !selectionMode;

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
    touchAction: 'none',
  };

  // Visual affordance only — drag listeners live on the outer sortable node
  // so the grab point aligns with wherever the user presses on the card.
  // The PointerSensor's 5px activation distance keeps body clicks from
  // accidentally starting a drag.
  const dragHandle = (
    <div
      aria-hidden="true"
      title={lockedReason ?? 'Drag to reorder'}
      className={`pointer-events-none flex h-8 w-6 shrink-0 items-center justify-center rounded-lg text-slate-300 ${
        lockedReason ? 'opacity-40' : ''
      }`}
    >
      <GripVertical className="h-4 w-4" />
    </div>
  );

  const accessibleName = lockedReason ?? 'Drag to reorder';
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-label={accessibleName}
      aria-disabled={Boolean(lockedReason) || undefined}
      className={lockedReason ? '' : 'cursor-grab active:cursor-grabbing'}
    >
      <CardBody {...props} dragHandle={dragHandle} isDragging={isDragging} />
    </div>
  );
}

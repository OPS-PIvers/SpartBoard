import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, Loader2, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { isEscapeFromWidgetInput, scrollMovesAnchor } from '@/utils/domHelpers';
import { Z_INDEX } from '@/config/zIndex';
import type { TourAnchorAttrs, TourAnchorId } from '@/config/tourAnchors';
import { tourFieldAttr } from '@/config/tourAnchors';
import { useCloseOnHostResize } from './useCloseOnHostResize';

type MenuIcon = React.ComponentType<{
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}>;

export interface OverflowMenuItem {
  label: string;
  /** Stable key and tour field; falls back to the label. */
  id?: string;
  icon?: MenuIcon;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Tooltip while disabled. */
  disabledReason?: string;
  /** Tooltip while enabled. */
  title?: string;
  /** Spinner in place of the icon while an async action runs. */
  loading?: boolean;
  /** Shortcut shown at the end of the row, e.g. "Ctrl+D". */
  hint?: string;
  /** Check mark at the end of the row, e.g. the current folder. */
  checked?: boolean;
  /** Asks again in the row with this label before running. */
  confirmLabel?: string;
  /** Leaves the menu open after running. */
  keepOpen?: boolean;
  /** Live-tour anchor; wins over the menu-level tagging. */
  anchor?: TourAnchorAttrs;
  /** Opens these rows in a side menu instead of running `onClick`. */
  submenu?: OverflowMenuItem[];
}

export interface OverflowMenuProps {
  items: OverflowMenuItem[];
  ariaLabel?: string;
  /** Replaces the kebab glyph, e.g. vertical dots or a caret. */
  triggerIcon?: LucideIcon;
  /** Replaces the trigger's default colours and radius. */
  triggerClassName?: string;
  /** Replaces the icon-only trigger with a labelled one, sized by its content. */
  triggerContent?: React.ReactNode;
  /** Trigger box size for the icon-only trigger, or extra styles for a labelled one. */
  triggerStyle?: React.CSSProperties;
  iconStyle?: React.CSSProperties;
  triggerTitle?: string;
  triggerAnchor?: TourAnchorAttrs;
  triggerTestId?: string;
  /** Stretches the trigger to its flex parent's height, e.g. beside a split-button primary. */
  stretch?: boolean;
  /** Tags each row `tourId` / `tourScope` / item id (or `item-N`). */
  tourId?: TourAnchorId;
  tourScope?: string;
  /** Tags rows by position: "1", "2", and "2-1" for a side-menu row. */
  itemAnchor?: (path: string) => TourAnchorAttrs | undefined;
  /** Moves destructive rows to the bottom. */
  destructiveLast?: boolean;
}

const MENU_MIN_WIDTH = 176;
const MENU_MAX_WIDTH = 288;
const SUBMENU_WIDTH = 240;
const MENU_GAP = 4;
const ROW_HEIGHT = 32;
const CHROME_HEIGHT = 10;
const EDGE = 8;
const PANEL_CLASS =
  'overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg';
const rowClass = (destructive?: boolean) =>
  `flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium transition-colors focus:outline-hidden aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${
    destructive
      ? 'text-brand-red-dark hover:bg-brand-red-lighter/30 focus-visible:bg-brand-red-lighter/30'
      : 'text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100'
  }`;

const keyOf = (item: OverflowMenuItem) => item.id ?? item.label;
const menuHeight = (count: number) => count * ROW_HEIGHT + CHROME_HEIGHT;
const menuItems = (el: HTMLElement | null) =>
  Array.from(el?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
const focusFirst = (el: HTMLElement | null) =>
  (
    el?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])'
    ) ?? el?.querySelector<HTMLElement>('[role="menuitem"]')
  )?.focus();

/** The app's one kebab menu: portalled, side menus, busy rows, arrow keys, Escape and Tab. */
export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  items,
  ariaLabel = 'More actions',
  triggerIcon: TriggerIcon = MoreHorizontal,
  triggerClassName = 'rounded-xl text-slate-500 hover:bg-white/70 hover:text-brand-blue-primary',
  triggerContent,
  triggerStyle,
  iconStyle,
  triggerTitle,
  triggerAnchor,
  triggerTestId,
  stretch = false,
  tourId,
  tourScope,
  itemAnchor,
  destructiveLast = true,
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left?: number;
    right?: number;
    maxWidth: number;
    maxHeight: number;
  } | null>(null);
  const [sub, setSub] = useState<{
    key: string;
    top: number;
    left?: number;
    right?: number;
    maxHeight: number;
  } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const subParentRef = useRef<HTMLElement | null>(null);
  const subCloseTimer = useRef<number | undefined>(undefined);
  const activeSub = open ? sub : null;

  const cancelSubClose = () => window.clearTimeout(subCloseTimer.current);
  // A short grace lets the mouse cross a row on its way into the side menu.
  const closeSubSoon = () => {
    cancelSubClose();
    subCloseTimer.current = window.setTimeout(() => setSub(null), 200);
  };
  useEffect(() => cancelSubClose, []);

  const close = (refocus: boolean) => {
    setOpen(false);
    setSub(null);
    setConfirming(null);
    if (refocus) triggerRef.current?.focus();
  };

  useClickOutside(wrapperRef, () => {
    setOpen(false);
    setSub(null);
    setConfirming(null);
  });

  // Document-level so Escape works wherever focus is; stopPropagation keeps it from minimizing the widget.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isEscapeFromWidgetInput(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (sub) {
        setSub(null);
        subParentRef.current?.focus();
        return;
      }
      setOpen(false);
      setConfirming(null);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, sub]);

  const ordered = destructiveLast
    ? [...items].sort((a, b) =>
        !!a.destructive === !!b.destructive ? 0 : a.destructive ? 1 : -1
      )
    : items;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Right-aligned to the trigger, or left-aligned when that would run off the left edge.
    const leftAlign = rect.right - EDGE < MENU_MAX_WIDTH;
    const right = Math.max(EDGE, window.innerWidth - rect.right);
    const left = Math.max(EDGE, rect.left);
    const room = leftAlign
      ? window.innerWidth - left - EDGE
      : window.innerWidth - right - EDGE;
    const maxWidth = Math.max(MENU_MIN_WIDTH, Math.min(MENU_MAX_WIDTH, room));
    const h = menuHeight(ordered.length);
    const below = rect.bottom + MENU_GAP;
    const spaceBelow = window.innerHeight - below - EDGE;
    const spaceAbove = rect.top - MENU_GAP - EDGE;
    const flip = h > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(ROW_HEIGHT * 3, flip ? spaceAbove : spaceBelow);
    const top = flip ? rect.top - MENU_GAP - Math.min(h, maxHeight) : below;
    setPos(
      leftAlign
        ? { top, left, maxWidth, maxHeight }
        : { top, right, maxWidth, maxHeight }
    );
  }, [open, ordered.length]);

  // Focus enters the menu once it is placed.
  useEffect(() => {
    if (open && pos) focusFirst(menuRef.current);
  }, [open, pos]);

  useEffect(() => {
    if (!open) return undefined;
    const closeNow = () => {
      setOpen(false);
      setSub(null);
      setConfirming(null);
    };
    // Only scrolls that move the trigger close it, so a live tour scrolling its own panels leaves it open.
    const onScroll = (e: Event) => {
      if (scrollMovesAnchor(e, triggerRef.current)) closeNow();
    };
    window.addEventListener('resize', closeNow);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', closeNow);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useCloseOnHostResize(open, wrapperRef, () => {
    setOpen(false);
    setSub(null);
    setConfirming(null);
  });

  // A menu whose rows all went away closes, so its Escape listener lets go.
  if (open && items.length === 0) {
    setOpen(false);
    setSub(null);
    setConfirming(null);
  }
  if (items.length === 0) return null;

  // Side menu opens right of its row, or left when the right runs off screen.
  const openSub = (item: OverflowMenuItem, row: HTMLElement) => {
    subParentRef.current = row;
    const rect = row.getBoundingClientRect();
    const h = menuHeight(item.submenu?.length ?? 0);
    const maxHeight = window.innerHeight - EDGE * 2;
    const flip = rect.right + SUBMENU_WIDTH + EDGE > window.innerWidth;
    const edge = flip
      ? { right: window.innerWidth - rect.left - 2 }
      : { left: rect.right - 2 };
    const top = Math.max(
      EDGE,
      Math.min(rect.top - 5, window.innerHeight - Math.min(h, maxHeight) - EDGE)
    );
    setSub({ key: keyOf(item), top, maxHeight, ...edge });
  };

  const anchorFor = (item: OverflowMenuItem, path: string, index: number) =>
    item.anchor ??
    itemAnchor?.(path) ??
    (tourId && tourScope
      ? tourFieldAttr(tourId, tourScope, item.id ?? `item-${index + 1}`)
      : {});

  const run = (item: OverflowMenuItem) => {
    if (item.disabled || item.loading) return;
    const key = keyOf(item);
    if (item.confirmLabel && confirming !== key) {
      setConfirming(key);
      return;
    }
    if (!item.keepOpen || item.confirmLabel) close(true);
    item.onClick();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const panel = e.currentTarget;
    if (e.key === 'Tab') {
      // Portalled to <body>, so a native Tab would jump to the end of the page.
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === 'ArrowLeft' && panel === subRef.current) {
      e.preventDefault();
      setSub(null);
      subParentRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    e.stopPropagation();
    const rows = menuItems(panel);
    if (rows.length === 0) return;
    const idx = rows.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? rows[(idx + 1) % rows.length]
        : rows[(idx - 1 + rows.length) % rows.length];
    next?.focus();
  };

  const renderRow = (
    item: OverflowMenuItem,
    path: string,
    index: number,
    inSub: boolean
  ) => {
    const Icon = item.icon;
    const key = keyOf(item);
    const asking = !!item.confirmLabel && confirming === key;
    const blocked = !!item.disabled || !!item.loading;
    const hasSub = !inSub && !!item.submenu && item.submenu.length > 0;
    const expanded = hasSub && activeSub?.key === key;
    return (
      <button
        key={key}
        type="button"
        role="menuitem"
        aria-disabled={blocked || undefined}
        aria-haspopup={hasSub ? 'menu' : undefined}
        aria-expanded={hasSub ? expanded : undefined}
        title={item.disabled ? item.disabledReason : (item.title ?? item.label)}
        {...anchorFor(item, path, index)}
        onPointerEnter={(e) => {
          if (inSub) return cancelSubClose();
          if (hasSub) {
            cancelSubClose();
            if (e.pointerType === 'mouse' && !blocked)
              openSub(item, e.currentTarget);
          } else if (e.pointerType === 'mouse') closeSubSoon();
        }}
        onKeyDown={(e) => {
          if (hasSub && e.key === 'ArrowRight' && !blocked) {
            e.preventDefault();
            openSub(item, e.currentTarget);
            requestAnimationFrame(() => focusFirst(subRef.current));
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!hasSub) return run(item);
          if (blocked) return;
          openSub(item, e.currentTarget);
          // Keyboard activation (no pointer) moves focus into the side menu.
          if (e.detail === 0)
            requestAnimationFrame(() => focusFirst(subRef.current));
        }}
        className={`${rowClass(!!item.destructive || asking)} ${
          expanded ? 'bg-slate-100' : ''
        }`}
      >
        {item.loading ? (
          <Loader2 size={14} className="shrink-0 animate-spin" />
        ) : (
          Icon && <Icon size={14} className="shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {asking ? item.confirmLabel : item.label}
        </span>
        {item.hint && (
          <kbd className="shrink-0 font-sans text-xxs text-slate-400">
            {item.hint}
          </kbd>
        )}
        {item.checked && (
          <Check
            size={14}
            className="shrink-0 text-brand-blue-primary"
            aria-label="Selected"
          />
        )}
        {hasSub && (
          <ChevronRight
            size={14}
            className="shrink-0 text-slate-400"
            aria-hidden="true"
          />
        )}
      </button>
    );
  };

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={ariaLabel}
            data-click-outside-ignore="true"
            onKeyDown={onMenuKeyDown}
            className={PANEL_CLASS}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              right: pos.right,
              width: 'max-content',
              minWidth: MENU_MIN_WIDTH,
              maxWidth: pos.maxWidth,
              maxHeight: pos.maxHeight,
              zIndex: Z_INDEX.popover,
            }}
          >
            {ordered.map((item, i) => renderRow(item, `${i + 1}`, i, false))}
          </div>,
          document.body
        )
      : null;

  const subParent = activeSub
    ? ordered.find((item) => keyOf(item) === activeSub.key)
    : undefined;
  const subParentIndex = subParent ? ordered.indexOf(subParent) : -1;
  const submenu =
    activeSub && subParent?.submenu
      ? createPortal(
          <div
            ref={subRef}
            role="menu"
            aria-label={subParent.label}
            data-click-outside-ignore="true"
            onPointerEnter={cancelSubClose}
            onKeyDown={onMenuKeyDown}
            className={PANEL_CLASS}
            style={{
              position: 'fixed',
              top: activeSub.top,
              left: activeSub.left,
              right: activeSub.right,
              width: 'max-content',
              minWidth: MENU_MIN_WIDTH,
              maxWidth: SUBMENU_WIDTH,
              maxHeight: activeSub.maxHeight,
              zIndex: Z_INDEX.popover,
            }}
          >
            {subParent.submenu.map((child, j) =>
              renderRow(child, `${subParentIndex + 1}-${j + 1}`, j, true)
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={wrapperRef} className={stretch ? 'relative flex' : 'relative'}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={triggerTitle ?? (triggerContent == null ? ariaLabel : undefined)}
        {...triggerAnchor}
        data-testid={triggerTestId}
        onClick={(e) => {
          e.stopPropagation();
          setSub(null);
          setConfirming(null);
          setOpen((v) => !v);
        }}
        className={`inline-flex shrink-0 items-center justify-center transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1 ${triggerClassName}`}
        style={
          triggerContent != null
            ? triggerStyle
            : {
                width: stretch ? 'min(32px, 9cqmin)' : 'min(36px, 10cqmin)',
                height: stretch ? undefined : 'min(36px, 10cqmin)',
                ...triggerStyle,
              }
        }
      >
        {triggerContent ?? (
          <TriggerIcon
            aria-hidden="true"
            style={{
              width: 'min(18px, 5cqmin)',
              height: 'min(18px, 5cqmin)',
              ...iconStyle,
            }}
          />
        )}
      </button>
      {menu}
      {submenu}
    </div>
  );
};

/** Kebab menu with side menus, shared by library item cards and assignment rows. */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import { Z_INDEX } from '@/config/zIndex';
import { useCloseOnHostResize } from '../useCloseOnHostResize';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { LibraryMenuAction } from './types';

/* ─── Overflow menu (click-outside aware) ─────────────────────────────────── */

interface OverflowMenuProps {
  actions: LibraryMenuAction[];
  /** `row-${index+1}` for the owning card, or undefined to skip tour tagging. */
  rowKey?: string;
  widgetType: string;
  /** Assignment rows (In Progress, Completed) keep their own tour anchor ids and a slightly smaller trigger. */
  archive?: boolean;
}

const MENU_WIDTH = 224; // w-56; fits the longest current item label ("Print response sheets") without truncating
const MENU_GAP = 4;
const MENU_ITEM_HEIGHT = 32;
const MENU_CHROME_HEIGHT = 10;
const SUBMENU_WIDTH = 224;
const MENU_PANEL_CLASS =
  'overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg';
const menuRowClass = (destructive?: boolean) =>
  `flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    destructive
      ? 'text-brand-red-dark hover:bg-brand-red-lighter/30'
      : 'text-slate-700 hover:bg-slate-100'
  }`;

export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  actions,
  rowKey,
  widgetType,
  archive = false,
}) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const [sub, setSub] = useState<{
    id: string;
    top: number;
    left?: number;
    right?: number;
  } | null>(null);
  const activeSub = open ? sub : null;
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const subParentRef = useRef<HTMLElement | null>(null);
  const subCloseTimer = useRef<number | undefined>(undefined);
  const cancelSubClose = () => window.clearTimeout(subCloseTimer.current);
  // A short grace lets the mouse cross a row on its way into the side menu.
  const closeSubSoon = () => {
    cancelSubClose();
    subCloseTimer.current = window.setTimeout(() => setSub(null), 200);
  };
  useEffect(() => cancelSubClose, []);

  useClickOutside(ref, () => setOpen(false));

  // stopPropagation prevents this portalled menu's Escape from also minimizing the topmost widget.
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isEscapeFromWidgetInput(e)) return;
      e.stopPropagation();
      if (sub) {
        setSub(null);
        subParentRef.current?.focus();
        return;
      }
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, sub]);

  // Side menu opens to the right of its row, or to the left when the right runs off screen.
  const openSub = (item: LibraryMenuAction, row: HTMLElement) => {
    subParentRef.current = row;
    const rect = row.getBoundingClientRect();
    const count = item.submenu?.length ?? 0;
    const height = count * MENU_ITEM_HEIGHT + MENU_CHROME_HEIGHT;
    const flip = rect.right + SUBMENU_WIDTH + 8 > window.innerWidth;
    const edge = flip
      ? { right: window.innerWidth - rect.left - 2 }
      : { left: rect.right - 2 };
    const top = Math.max(
      8,
      Math.min(rect.top - 5, window.innerHeight - height - 8)
    );
    setSub({ id: item.id, top, ...edge });
  };

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportW =
      typeof window !== 'undefined' ? window.innerWidth : rect.right;
    // Right-align menu to the trigger, clamped to viewport.
    const left = Math.max(
      8,
      Math.min(rect.right - MENU_WIDTH, viewportW - MENU_WIDTH - 8)
    );
    // Flip above the trigger when the menu would run off the bottom of the viewport.
    const viewportH =
      typeof window !== 'undefined' ? window.innerHeight : Infinity;
    const menuH = actions.length * MENU_ITEM_HEIGHT + MENU_CHROME_HEIGHT;
    const below = rect.bottom + MENU_GAP;
    const top =
      below + menuH > viewportH - 8 && rect.top - MENU_GAP - menuH >= 8
        ? rect.top - MENU_GAP - menuH
        : below;
    setMenuPos({ top, left });
  }, [actions.length, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    // Capture phase catches scrolls on any ancestor scroll container.
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  useCloseOnHostResize(open, ref, () => setOpen(false));

  if (actions.length === 0) return null;

  // Destructive actions float to the bottom to mirror the Quiz pattern.
  const ordered = [...actions].sort((a, b) => {
    if (a.destructive === b.destructive) return 0;
    return a.destructive ? 1 : -1;
  });

  const menu =
    open && menuPos
      ? createPortal(
          <div
            role="menu"
            data-click-outside-ignore="true"
            className={`min-w-[224px] ${MENU_PANEL_CLASS}`}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: MENU_WIDTH,
              zIndex: Z_INDEX.popover,
            }}
          >
            {ordered.map((item, i) => {
              const Icon = item.icon;
              const anchorAttrs =
                item.anchor ??
                (rowKey
                  ? archive
                    ? tourFieldAttr(
                        'library-shell.archive-menu-item',
                        widgetType,
                        `${rowKey}-item-${i + 1}`
                      )
                    : tourFieldAttr(
                        'library-shell.card-menu-item',
                        widgetType,
                        `${rowKey}-item-${i + 1}`
                      )
                  : {});
              if (item.submenu && item.submenu.length > 0) {
                const expanded = activeSub?.id === item.id;
                return (
                  <button
                    key={item.id}
                    role="menuitem"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={expanded}
                    onPointerEnter={(e) => {
                      cancelSubClose();
                      if (e.pointerType === 'mouse')
                        openSub(item, e.currentTarget);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.disabled) return;
                      openSub(item, e.currentTarget);
                      // Keyboard activation (no pointer) moves focus into the side menu.
                      if (e.detail === 0)
                        requestAnimationFrame(() =>
                          subRef.current
                            ?.querySelector<HTMLButtonElement>(
                              '[role="menuitem"]'
                            )
                            ?.focus()
                        );
                    }}
                    disabled={item.disabled}
                    title={item.disabled ? item.disabledReason : undefined}
                    {...anchorAttrs}
                    className={`${menuRowClass(item.destructive)} ${
                      expanded ? 'bg-slate-100' : ''
                    }`}
                  >
                    {Icon && <Icon size={14} className="shrink-0" />}
                    <span className="flex-1 truncate">{item.label}</span>
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                  </button>
                );
              }
              return (
                <button
                  key={item.id}
                  role="menuitem"
                  type="button"
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') closeSubSoon();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    if (!item.disabled) item.onClick();
                  }}
                  disabled={item.disabled}
                  title={item.disabled ? item.disabledReason : item.label}
                  {...anchorAttrs}
                  className={menuRowClass(item.destructive)}
                >
                  {Icon && <Icon size={14} className="shrink-0" />}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  const subParent = activeSub
    ? ordered.find((a) => a.id === activeSub.id)
    : undefined;
  const subParentIndex = subParent ? ordered.indexOf(subParent) : -1;
  const submenu =
    activeSub && subParent?.submenu
      ? createPortal(
          <div
            ref={subRef}
            role="menu"
            aria-label={subParent.label}
            onPointerEnter={cancelSubClose}
            data-click-outside-ignore="true"
            className={MENU_PANEL_CLASS}
            style={{
              position: 'fixed',
              top: activeSub.top,
              left: activeSub.left,
              right: activeSub.right,
              minWidth: 176,
              width: 'max-content',
              maxWidth: SUBMENU_WIDTH,
              zIndex: Z_INDEX.popover,
            }}
          >
            {subParent.submenu.map((child, j) => {
              const Icon = child.icon;
              return (
                <button
                  key={child.id}
                  role="menuitem"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    if (!child.disabled) child.onClick();
                  }}
                  disabled={child.disabled}
                  title={child.disabled ? child.disabledReason : child.label}
                  {...(child.anchor ??
                    (rowKey
                      ? archive
                        ? tourFieldAttr(
                            'library-shell.archive-menu-item',
                            widgetType,
                            `${rowKey}-item-${subParentIndex + 1}-${j + 1}`
                          )
                        : tourFieldAttr(
                            'library-shell.card-menu-item',
                            widgetType,
                            `${rowKey}-item-${subParentIndex + 1}-${j + 1}`
                          )
                      : {}))}
                  className={menuRowClass(child.destructive)}
                >
                  {Icon && <Icon size={14} className="shrink-0" />}
                  <span className="truncate">{child.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setSub(null);
          setOpen((v) => !v);
        }}
        {...(rowKey
          ? archive
            ? tourFieldAttr('library-shell.archive-menu', widgetType, rowKey)
            : tourFieldAttr('library-shell.card-menu', widgetType, rowKey)
          : {})}
        className="inline-flex shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        style={
          archive
            ? { width: 'min(30px, 8cqmin)', height: 'min(30px, 8cqmin)' }
            : { width: 'min(32px, 9cqmin)', height: 'min(32px, 9cqmin)' }
        }
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
      {menu}
      {submenu}
    </div>
  );
};

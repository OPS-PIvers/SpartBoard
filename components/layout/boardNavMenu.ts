import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Collection } from '@/types';
import { flattenTree } from '@/utils/folderTree';

export const MENU_PANEL_CLASS =
  'absolute bottom-full left-0 mb-2 w-64 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150';

export const MENU_HEADER_CLASS =
  'px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-white/40';

// Row actions stay hidden until hover/focus, except on touch screens with no hover.
export const ROW_ACTIONS_CLASS =
  'flex shrink-0 items-center gap-0.5 pr-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';

/** One flattened row: the Collection, its nesting depth, and the parent id a
 * consumer should group it under (differs from `c.parentCollectionId` only
 * for a surfaced orphan root, whose real parent no longer exists). */
export interface FlatCollection {
  c: Collection;
  depth: number;
  effectiveParentId: string | null;
}

/** Tree-ordered flat list of Collections with their nesting depth. */
export const flattenCollections = (
  collections: Collection[]
): FlatCollection[] =>
  flattenTree(collections, (c) => c.parentCollectionId).map(
    ({ node, depth, effectiveParentId }) => ({
      c: node,
      depth,
      effectiveParentId,
    })
  );

/** ArrowLeft/ArrowRight between a row's menuitem and its action buttons. */
export const moveFocusWithinRow = (
  e: ReactKeyboardEvent<HTMLElement>,
  dir: 1 | -1
): boolean => {
  const active = document.activeElement;
  const row = active?.closest<HTMLElement>('[data-menu-row]');
  if (!row) return false;
  const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>('button'));
  const next = buttons[buttons.indexOf(active as HTMLButtonElement) + dir];
  if (!next) return false;
  e.preventDefault();
  next.focus();
  return true;
};

/** Refocus a menu element after an inline edit, unless focus already moved elsewhere. */
export const refocusIfLost = (
  root: HTMLElement | null,
  selector: string
): void => {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    root?.querySelector<HTMLElement>(selector)?.focus();
  });
};

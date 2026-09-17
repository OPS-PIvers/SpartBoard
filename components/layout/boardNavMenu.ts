import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Collection } from '@/types';

export const MENU_PANEL_CLASS =
  'absolute bottom-full left-0 mb-2 w-64 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150';

export const MENU_HEADER_CLASS =
  'px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-white/40';

// Row actions stay hidden until hover/focus, except on touch screens with no hover.
export const ROW_ACTIONS_CLASS =
  'flex shrink-0 items-center gap-0.5 pr-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';

/** Tree-ordered flat list of Collections with their nesting depth. */
export const flattenCollections = (
  collections: Collection[]
): { c: Collection; depth: number }[] => {
  const childrenByParent = new Map<string | null, Collection[]>();
  for (const c of collections) {
    const bucket = childrenByParent.get(c.parentCollectionId) ?? [];
    bucket.push(c);
    childrenByParent.set(c.parentCollectionId, bucket);
  }
  for (const bucket of childrenByParent.values()) {
    bucket.sort((a, b) => a.order - b.order);
  }
  const knownIds = new Set(collections.map((c) => c.id));
  const out: { c: Collection; depth: number }[] = [];
  const visited = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const k of childrenByParent.get(parent) ?? []) {
      if (visited.has(k.id)) continue;
      visited.add(k.id);
      out.push({ c: k, depth });
      walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  // Surface orphans (parent missing, e.g. a partial delete) at root instead of hiding them.
  const orphanRoots = collections
    .filter(
      (c) =>
        c.parentCollectionId != null &&
        !knownIds.has(c.parentCollectionId) &&
        !visited.has(c.id)
    )
    .sort((a, b) => a.order - b.order);
  for (const c of orphanRoots) {
    visited.add(c.id);
    out.push({ c, depth: 0 });
    walk(c.id, 1);
  }
  return out;
};

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

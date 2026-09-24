import { useEffect, useState, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** False when CSS hides `el` or an ancestor below `root` with `display: none`, e.g. a `lg:hidden` control. */
function displayed(el: HTMLElement, root: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== root; n = n.parentElement) {
    if (getComputedStyle(n).display === 'none') return false;
  }
  return true;
}

/** Tabbable elements inside `root`, in DOM order, skipping inert, hidden and invisible ones. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest('[inert], [hidden], [aria-hidden="true"]') &&
      !(el instanceof HTMLInputElement && el.type === 'file') &&
      !el.classList.contains('hidden') &&
      getComputedStyle(el).visibility !== 'hidden' &&
      displayed(el, root)
  );
}

/** Moves focus into `root` on open and keeps Tab inside it; overlays above it keep their own focus. */
export function useStudioFocusTrap(
  rootRef: RefObject<HTMLElement | null>,
  enabled = true
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!root.contains(document.activeElement))
      root.focus({ preventScroll: true });
  }, [rootRef]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (e.key !== 'Tab' || e.defaultPrevented || !root) return;
      const active = document.activeElement;
      const inside = active !== null && root.contains(active);
      // Focus in a menu, toast or dialog above the Studio is that layer's business.
      if (!inside && active !== null && active !== document.body) return;
      const list = tabbables(root);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      let next: HTMLElement | null = null;
      if (!inside || active === root) next = e.shiftKey ? last : first;
      else if (e.shiftKey && active === first) next = last;
      else if (!e.shiftKey && active === last) next = first;
      if (!next) return;
      e.preventDefault();
      next.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [rootRef, enabled]);
}

/** Remembers what had focus when the Studio opened and gives it focus back on close. */
export function useReturnFocusOnClose(): void {
  const [opener] = useState(() =>
    typeof document === 'undefined'
      ? null
      : (document.activeElement as HTMLElement | null)
  );
  useEffect(
    () => () => {
      const active = document.activeElement;
      const lost =
        active === null || active === document.body || !active.isConnected;
      if (opener && opener !== document.body && opener.isConnected && lost)
        opener.focus({ preventScroll: true });
    },
    [opener]
  );
}

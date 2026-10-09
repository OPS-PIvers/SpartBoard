import { accessibleName, roleOf } from './resolveTourAnchor';

// Menus, lists and non-modal panels an app control opens.
const POPUP =
  '[role="menu"], [role="listbox"], [role="dialog"]:not([aria-modal="true"])';

const CONTROL =
  'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"]';

// Tagged regions too broad to name one control inside them.
const CONTAINER_ANCHORS = new Set(['widget.window']);

/** An untagged control under `target` to bind by role and name instead of `tagged`, its tagged ancestor. */
export function untaggedControlOf(
  target: Element,
  tagged: Element | null
): HTMLElement | null {
  const control = target.closest<HTMLElement>(CONTROL);
  if (!control || control === tagged || control.closest('[data-tour-ignore]'))
    return null;
  if (tagged && !tagged.contains(control)) return null;
  if (!roleOf(control) || !accessibleName(control)) return null;
  if (!tagged) return control;
  if (CONTAINER_ANCHORS.has(tagged.getAttribute('data-tour') ?? ''))
    return control;
  // A menu rendered inside its opener's tagged wrapper is not the opener.
  const popup = control.closest(POPUP);
  return popup && popup !== tagged && tagged.contains(popup) ? control : null;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Open menus and popovers on screen, which the tour's own UI keeps clear of. */
export function openPopupBoxes(): Box[] {
  if (typeof document === 'undefined') return [];
  const els = new Set<Element>(document.querySelectorAll(POPUP));
  document
    .querySelectorAll('[aria-expanded="true"][aria-controls]')
    .forEach((opener) => {
      const id = opener.getAttribute('aria-controls')?.split(/\s+/)[0];
      const el = id ? document.getElementById(id) : null;
      if (el) els.add(el);
    });
  const area = window.innerWidth * window.innerHeight;
  const boxes: Box[] = [];
  els.forEach((el) => {
    if (el.closest('[data-tour-ignore], [data-tour-overlay]')) return;
    const r = el.getBoundingClientRect();
    // Full-screen panels are the page, not a popover over it.
    if (r.width <= 0 || r.height <= 0 || r.width * r.height > area / 2) return;
    boxes.push({ x: r.x, y: r.y, w: r.width, h: r.height });
  });
  return boxes;
}

const NEAR = 24;

/** The target grown to cover a menu it opened, so the callout sits beside both. */
export function withNearbyPopups(target: Box, popups: readonly Box[]): Box {
  let out = target;
  for (const p of popups) {
    const near =
      p.x < out.x + out.w + NEAR &&
      p.x + p.w > out.x - NEAR &&
      p.y < out.y + out.h + NEAR &&
      p.y + p.h > out.y - NEAR;
    if (!near) continue;
    const x = Math.min(out.x, p.x);
    const y = Math.min(out.y, p.y);
    out = {
      x,
      y,
      w: Math.max(out.x + out.w, p.x + p.w) - x,
      h: Math.max(out.y + out.h, p.y + p.h) - y,
    };
  }
  return out;
}

const SHIELDED = ['pointerdown', 'mousedown', 'touchstart'] as const;

/** Keeps clicks on the tour's own UI from reaching the app's outside-click handlers, so open menus stay open. */
export function shieldTourUi(): () => void {
  const stop = (e: Event) => {
    if (e.target instanceof Element && e.target.closest('[data-tour-ignore]'))
      e.stopPropagation();
  };
  // On body, after React's own listener there, so the tour UI still handles its clicks.
  SHIELDED.forEach((type) => document.body.addEventListener(type, stop));
  return () =>
    SHIELDED.forEach((type) => document.body.removeEventListener(type, stop));
}

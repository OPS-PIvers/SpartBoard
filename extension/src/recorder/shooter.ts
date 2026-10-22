import type { BlurSettings } from './blurSettings';
import {
  applyPageBlur,
  ensureBlurStyle,
  HOVER_ATTR,
  markPicks,
  PICK_ATTR,
} from './pageBlur';

const HOVER_CSS = `[${HOVER_ATTR}]{outline:2px solid #2d3f89!important;outline-offset:2px!important;cursor:crosshair!important}`;

export interface Shooter {
  picking: () => boolean;
  /** Turns Click to blur on or off and marks what was already picked on this page. */
  setPicking: (on: boolean, picks: readonly string[]) => void;
  /** Picks or unpicks one element; true when it is now picked. */
  togglePick: (el: Element) => boolean;
  /** Blurs the frame for one picture and resolves once that has painted. */
  shoot: (settings: BlurSettings, picks: readonly string[]) => Promise<void>;
  /** Takes the blur off again after the picture. */
  done: () => Promise<void>;
  dispose: () => void;
}

const nextPaint = (win: Window) =>
  new Promise<void>((resolve) =>
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()))
  );

/** One frame's blur state while recording; `setPill` hides the Recording pill in the top frame. */
export function createShooter(
  doc: Document,
  setPill: (shown: boolean) => Promise<void>
): Shooter {
  const win = doc.defaultView ?? window;
  let picking = false;
  let undo: (() => void) | null = null;
  let hovered: Element | null = null;
  let removeHoverStyle: (() => void) | null = null;

  const setHover = (el: Element | null) => {
    hovered?.removeAttribute(HOVER_ATTR);
    hovered = el;
    el?.setAttribute(HOVER_ATTR, '');
  };
  const onOver = (e: Event) => {
    if (
      e.target instanceof Element &&
      !e.target.closest('[data-spart-extension]')
    )
      setHover(e.target);
  };

  const setPicking = (on: boolean, picks: readonly string[]) => {
    markPicks(doc, picks);
    if (on === picking) return;
    picking = on;
    if (on) {
      const style = doc.createElement('style');
      style.textContent = HOVER_CSS;
      (doc.head ?? doc.documentElement).appendChild(style);
      removeHoverStyle = () => style.remove();
      doc.addEventListener('pointerover', onOver, true);
    } else {
      doc.removeEventListener('pointerover', onOver, true);
      setHover(null);
      removeHoverStyle?.();
      removeHoverStyle = null;
    }
  };

  return {
    picking: () => picking,
    setPicking,
    togglePick: (el) => {
      if (el.hasAttribute(PICK_ATTR)) {
        el.removeAttribute(PICK_ATTR);
        return false;
      }
      ensureBlurStyle(doc, PICK_ATTR);
      el.setAttribute(PICK_ATTR, '');
      return true;
    },
    shoot: async (settings, picks) => {
      undo?.();
      // The hover outline would show in the picture.
      const wasHovered = hovered;
      setHover(null);
      const blur = applyPageBlur(doc, settings, picks);
      undo = () => {
        blur();
        if (picking && wasHovered?.isConnected) setHover(wasHovered);
      };
      await Promise.all([setPill(false), nextPaint(win)]);
    },
    done: async () => {
      undo?.();
      undo = null;
      await setPill(true);
    },
    dispose: () => {
      undo?.();
      undo = null;
      setPicking(false, []);
      doc
        .querySelectorAll(`[${PICK_ATTR}]`)
        .forEach((el) => el.removeAttribute(PICK_ATTR));
    },
  };
}

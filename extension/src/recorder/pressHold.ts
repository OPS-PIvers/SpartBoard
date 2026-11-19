// Holds a recorded press back from the page until its picture is taken, then replays it.

/** The events one press (or a quick double press) sends that the page would react to. */
export const HELD_EVENTS = [
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
  'dblclick',
] as const;

const OWN_HOST = '[data-spart-extension]';

// A press is let through after this even when no picture comes back.
export const MAX_HOLD_MS = 2500;

interface Held {
  target: EventTarget;
  event: MouseEvent;
}

export interface PressHold {
  /** Starts holding this press; `release` lets it and anything held after it reach the page. */
  hold: (first: MouseEvent) => () => void;
  holding: () => boolean;
  dispose: () => void;
}

const mouseInit = (e: MouseEvent): MouseEventInit => ({
  bubbles: e.bubbles,
  cancelable: e.cancelable,
  composed: e.composed,
  view: e.view,
  detail: e.detail,
  screenX: e.screenX,
  screenY: e.screenY,
  clientX: e.clientX,
  clientY: e.clientY,
  ctrlKey: e.ctrlKey,
  shiftKey: e.shiftKey,
  altKey: e.altKey,
  metaKey: e.metaKey,
  button: e.button,
  buttons: e.buttons,
  relatedTarget: e.relatedTarget,
});

/** A copy of a held event the page can still handle; the original was already dispatched. */
function copyOf(e: MouseEvent): MouseEvent {
  if (typeof PointerEvent === 'function' && e instanceof PointerEvent) {
    const p = e;
    return new PointerEvent(p.type, {
      ...mouseInit(p),
      pointerId: p.pointerId,
      width: p.width,
      height: p.height,
      pressure: p.pressure,
      tiltX: p.tiltX,
      tiltY: p.tiltY,
      pointerType: p.pointerType,
      isPrimary: p.isPrimary,
    });
  }
  return new MouseEvent(e.type, mouseInit(e));
}

// Pressing these does its work on the press itself (caret, native menu, drag), so they are never held.
const PRESS_NATIVE = [
  'input:not([type=button],[type=submit],[type=reset],[type=checkbox],[type=radio],[type=image],[type=file],[type=color])',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable=false])',
  '[draggable=true]',
].join(',');

const FOCUSABLE =
  'a[href],area[href],button,input,select,textarea,summary,iframe,[tabindex],[contenteditable]:not([contenteditable=false])';

/** Whether a press on this element can wait for its picture. */
export const canHold = (el: Element): boolean => !el.closest(PRESS_NATIVE);

/** Moves focus as the browser would have on the held press. */
function focusFor(target: EventTarget): void {
  if (!(target instanceof Element)) return;
  const el = target.closest(FOCUSABLE);
  if (el instanceof HTMLElement || el instanceof SVGElement) {
    el.focus({ preventScroll: true });
    return;
  }
  const active = target.ownerDocument.activeElement;
  if (active instanceof HTMLElement && active !== target.ownerDocument.body)
    active.blur();
}

/** Holds trusted presses in `win` while a picture is taken, so the picture shows the page before the press. */
export function createPressHold(
  win: EventTarget,
  isReal: (e: Event) => boolean = (e) => e.isTrusted
): PressHold {
  let queue: Held[] | null = null;
  // A late release from an earlier hold never lets a newer one go.
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const held = queue ?? [];
    queue = null;
    generation += 1;
    for (const { target, event } of held) {
      // A target the page removed meanwhile can't take the press any more.
      if (target instanceof Node && !target.isConnected) continue;
      const copy = copyOf(event);
      target.dispatchEvent(copy);
      if (copy.type === 'mousedown' && !copy.defaultPrevented) focusFor(target);
    }
  };

  const onEvent = (e: Event) => {
    if (!queue || !isReal(e) || !(e instanceof MouseEvent)) return;
    const target = e.composedPath()[0] ?? e.target;
    if (!target || queue.some((h) => h.event === e)) return;
    // The extension's own overlays always answer at once.
    if (target instanceof Element && target.closest(OWN_HOST)) return;
    queue.push({ target, event: e });
    e.stopImmediatePropagation();
    // Defaults (focus, following a link, ticking a box) wait for the copy.
    if (e.type !== 'pointerdown' && e.type !== 'pointerup') e.preventDefault();
  };

  for (const type of HELD_EVENTS)
    win.addEventListener(type, onEvent, { capture: true });

  return {
    hold: (first) => {
      if (!queue) {
        queue = [];
        timer = setTimeout(flush, MAX_HOLD_MS);
      }
      onEvent(first);
      const mine = generation;
      return () => {
        if (mine === generation) flush();
      };
    },
    holding: () => queue !== null,
    dispose: () => {
      flush();
      for (const type of HELD_EVENTS)
        win.removeEventListener(type, onEvent, { capture: true });
    },
  };
}

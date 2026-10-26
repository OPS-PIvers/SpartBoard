import type {} from '../playback/frameScript';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { OverlayRect } from './overlayState';
import { benchMark } from '../bench';

/** How long the spotlight takes to move from one target to the next. */
export const GLIDE_MS = 240;
/** How long the spotlight stays over a target that vanished, so a quick next find glides instead of blinking out. */
export const HOLD_MS = 600;
// The glide counts from the frame before it is first drawn, so the spotlight moves on the very frame the target is found.
const FRAME_MS = 1000 / 60;
// Room kept around a target that counts as already in view, so the tip below it fits too.
const VIEW_MARGIN = 24;

const same = (a: OverlayRect | null, b: OverlayRect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height);

const easeOut = (t: number) => 1 - (1 - t) ** 3;

const mix = (a: OverlayRect, b: OverlayRect, t: number): OverlayRect => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  width: a.width + (b.width - a.width) * t,
  height: a.height + (b.height - a.height) * t,
});

const reducedMotion = (view: Window) =>
  view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The element the locator matched in this frame, and its seek token, shared through the content scripts' isolated world. */
export const sharedTarget = () => globalThis.__sbWebTourFrame?.target ?? null;

export interface TrackedTarget {
  rect: OverlayRect | null;
  /** The seek token of the target the spotlight is on or moving to. */
  token: string | null;
}

const NONE: TrackedTarget = { rect: null, token: null };

/** The element's box, or null once it is gone or has no size (a menu that closed), so the spotlight holds instead of shrinking to a corner. */
function boxOf(el: Element | null): OverlayRect | null {
  if (!el?.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** Whether the element sits fully inside the window and every scrolling box around it. */
export function inView(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return true;
  const r = el.getBoundingClientRect();
  if (
    r.top < VIEW_MARGIN ||
    r.left < 0 ||
    r.bottom > view.innerHeight - VIEW_MARGIN ||
    r.right > view.innerWidth
  )
    return false;
  for (let up = el.parentElement; up; up = up.parentElement) {
    const style = view.getComputedStyle(up);
    if (style.overflowX === 'visible' && style.overflowY === 'visible')
      continue;
    const c = up.getBoundingClientRect();
    if (
      r.top < c.top ||
      r.left < c.left ||
      r.bottom > c.bottom ||
      r.right > c.right
    )
      return false;
  }
  return true;
}

/** Brings a new target into view only when it isn't already, smoothly unless the learner asked for less motion. */
function reveal(el: Element) {
  const view = el.ownerDocument.defaultView;
  if (!view || inView(el)) return;
  el.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: reducedMotion(view) ? 'auto' : 'smooth',
  });
}

/** Follows the matched target's box every frame while `active`: glides to each new target the moment this frame finds it, and holds over a vanished one for a moment before letting go. */
export function useTargetRect(active: boolean): TrackedTarget {
  const [tracked, setTracked] = useState<TrackedTarget>(NONE);
  const drawn = useRef<TrackedTarget>(NONE);
  useEffect(() => {
    const draw = (rect: OverlayRect | null, token: string | null) => {
      const was = drawn.current;
      if (same(rect, was.rect) && token === was.token) return;
      drawn.current = { rect, token };
      if (!same(rect, was.rect)) benchMark('rect', { rect });
      // Painted in this animation frame rather than the next.
      const next = drawn.current;
      flushSync(() => setTracked(next));
    };
    drawn.current = NONE;
    if (!active) return;
    let raf = 0;
    let el: Element | null = null;
    let token: string | null = null;
    let from: OverlayRect | null = null;
    let start = 0;
    let missingSince = 0;
    const step = (now: number) => {
      const current = sharedTarget();
      if ((current?.el ?? null) !== el) {
        el = current?.el ?? null;
        from = drawn.current.rect;
        start = now - FRAME_MS;
        if (el) reveal(el);
      }
      if (current) token = current.token;
      const live = boxOf(el);
      if (live) missingSince = 0;
      else if (!missingSince) missingSince = now;
      const held = now - missingSince < HOLD_MS;
      let next = live ?? (held ? drawn.current.rect : null);
      if (live && from && !reducedMotion(window)) {
        const t = (now - start) / GLIDE_MS;
        if (t < 1) next = mix(from, live, easeOut(t));
      }
      draw(next, next ? token : null);
    };
    const tick = (now: number) => {
      step(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // A target found mid-frame is drawn right away, in the frame its page change paints in.
    const shared = (globalThis.__sbWebTourFrame ??= { target: null });
    const onTarget = () => step(performance.now());
    shared.onTarget = onTarget;
    return () => {
      if (shared.onTarget === onTarget) delete shared.onTarget;
      cancelAnimationFrame(raf);
      // A later activation starts fresh instead of drawing this one's last box for a render.
      setTracked(NONE);
    };
  }, [active]);
  return active ? tracked : NONE;
}

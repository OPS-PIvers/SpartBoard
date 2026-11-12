import { useEffect, useState } from 'react';
import type { GuidedLearningTourBinding } from '@/types';
import { isRowWildcardRef } from '@/config/tourAnchors';
import {
  anchorInView,
  findTourAnchor,
  findTourAnchors,
  isAnchorReachable,
  scrollParent,
  type TourAnchorScope,
} from './resolveTourAnchor';
import { WAITING_AFTER_MS } from './playbackEngine';

/** How long a step searches before it reports `missing`; it keeps watching after that. Shared with web tours' waiting chip. */
export const ANCHOR_SEARCH_MS = WAITING_AFTER_MS;
/** Minimum gap between role-and-name searches while the anchor is missing; a `data-tour` id is looked up every frame. */
export const ANCHOR_SEARCH_THROTTLE_MS = 250;
// Longest a transition on an anchor ancestor is followed frame by frame.
const MAX_MOTION_MS = 2000;

// Attribute changes that can open, close or move a panel.
const WATCHED_ATTRS = [
  'class',
  'style',
  'hidden',
  'open',
  'aria-expanded',
  'aria-hidden',
  'data-state',
  'data-tour',
];

const MOTION_START = ['transitionrun', 'animationstart'] as const;
const MOTION_END = [
  'transitionend',
  'transitioncancel',
  'animationend',
  'animationcancel',
] as const;

export interface AnchorState {
  element: HTMLElement | null;
  rect: DOMRect | null;
  status: 'idle' | 'searching' | 'found' | 'missing';
  /** A settings-drawer anchor that has been scrolled to the drawer's centre. */
  centred?: boolean;
  /** Every row a `#row-*` step can take, `element` first; `rect` then covers them all. */
  matches?: readonly HTMLElement[];
}

const IDLE: AnchorState = { element: null, rect: null, status: 'idle' };

const sameMatches = (
  a: readonly HTMLElement[] | undefined,
  b: readonly HTMLElement[] | undefined
) =>
  a === b ||
  (!!a && !!b && a.length === b.length && a.every((el, i) => el === b[i]));

/** The smallest box around every rect. */
const unionRect = (rects: readonly DOMRect[]): DOMRect => {
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
};

const sameRect = (a: DOMRect | null, b: DOMRect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height);

/** The scrolling body of the settings drawer around an anchor, if it sits in one. */
export function drawerScroller(el: HTMLElement): HTMLElement | null {
  const root = el.closest('[data-tour="settings.root"]');
  if (!root) return null;
  const view = el.ownerDocument.defaultView;
  for (let n = el.parentElement; n && root.contains(n); n = n.parentElement) {
    if (/(auto|scroll|overlay)/.test(view?.getComputedStyle(n).overflowY ?? ''))
      return n;
  }
  return null;
}

/** Scrolls `scroller` so `el` sits in its vertical centre, clamped; returns the target scrollTop. */
export function centreInScroller(
  el: HTMLElement,
  scroller: HTMLElement
): number {
  const box = scroller.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const top =
    scroller.scrollTop + (r.top - box.top) - (box.height - r.height) / 2;
  const reduce =
    el.ownerDocument.defaultView?.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches ?? false;
  const next = Math.min(max, Math.max(0, Math.round(top)));
  if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo({ top: next, behavior: reduce ? 'auto' : 'smooth' });
  } else {
    scroller.scrollTop = next;
  }
  return next;
}

const isTourUi = (node: Node) =>
  (node instanceof Element ? node : node.parentElement)?.closest(
    '[data-tour-ignore]'
  ) != null;

/** Finds a tour anchor, waiting for it to appear, and tracks its viewport rect. */
export function useAnchorElement(
  binding: Pick<
    GuidedLearningTourBinding,
    'anchor' | 'fallback' | 'slot'
  > | null,
  scope: TourAnchorScope,
  attempt = 0
): AnchorState {
  const anchor = binding?.anchor ?? null;
  const fallbackRole = binding?.fallback?.role;
  const fallbackName = binding?.fallback?.name;
  const slot = binding?.slot;
  const boundId = slot === undefined ? undefined : scope.slots?.[slot];
  const scopeKey = (scope.widgetIds ?? []).join(',');
  // An empty anchor goes straight to the role/name fallback.
  const searchable = !!anchor || !!(fallbackRole && fallbackName);
  const anyRow = !!anchor && isRowWildcardRef(anchor);
  const requestKey = [
    anchor,
    fallbackRole,
    fallbackName,
    scopeKey,
    boundId,
    attempt,
  ].join('|');
  const [state, setState] = useState<AnchorState & { key: string }>({
    ...IDLE,
    key: '',
  });

  useEffect(() => {
    if (!searchable) return;
    const key = requestKey;
    const target = {
      anchor: anchor ?? '',
      fallback:
        fallbackRole && fallbackName
          ? { role: fallbackRole, name: fallbackName }
          : undefined,
      slot: boundId ? 0 : undefined,
    };
    const widgetIds = scopeKey ? scopeKey.split(',') : [];
    const slots = boundId ? { 0: boundId } : undefined;
    let cancelled = false;
    let element: HTMLElement | null = null;
    let lastRect: DOMRect | null = null;
    let scrolled = false;
    // An anchor that needs scrolling reads as searching until its scroll has settled.
    let scroll: 'none' | 'pending' | 'scrolling' | 'done' = 'none';
    let scrollSince = 0;
    let scrollTarget = 0;
    // A drawer anchor is centred once the drawer stops moving, not when first found.
    let scroller: HTMLElement | null = null;
    let centred = false;
    let raf = 0;
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    let missTimer: ReturnType<typeof setTimeout> | undefined;
    let searchRaf = 0;
    // The role/name fallback scans the page, so it runs at most once per throttle window; the data-tour id is looked up every frame.
    let lastFallback = -Infinity;
    const idOnly = target.anchor ? { ...target, fallback: undefined } : null;
    // Transitions running anywhere while the anchor is missing: a panel sliding in shows its control mid-way.
    const opening = new Map<EventTarget, number>();
    let resizeObserver: ResizeObserver | null = null;
    // Transitions running on the anchor or an ancestor, by start time.
    const moving = new Map<EventTarget, number>();

    const publish = (next: AnchorState) =>
      setState((prev) =>
        prev.key === key &&
        prev.status === next.status &&
        prev.element === next.element &&
        prev.centred === next.centred &&
        sameMatches(prev.matches, next.matches) &&
        sameRect(prev.rect, next.rect)
          ? prev
          : { ...next, key }
      );

    const schedule = () => {
      if (!cancelled && element && !raf) raf = requestAnimationFrame(measure);
    };

    const stillMoving = () => {
      const now = Date.now();
      moving.forEach((at, t) => {
        if (now - at > MAX_MOTION_MS) moving.delete(t);
      });
      return moving.size > 0;
    };

    const measure = () => {
      raf = 0;
      const el = element;
      if (cancelled || !el) return;
      // Faded, click-through, or off-screen with no panel to scroll reads as searching.
      if (!el.isConnected || !isAnchorReachable(el)) {
        lose();
        return;
      }
      const next = el.getBoundingClientRect();
      const moved = !sameRect(lastRect, next);
      lastRect = next;
      const settled = !moved && !stillMoving();
      if (scroll === 'pending' && scroller && settled) {
        scroll = 'scrolling';
        scrollSince = Date.now();
        scrollTarget = centreInScroller(el, scroller);
      } else if (scroll === 'scrolling') {
        const arrived = scroller
          ? Math.abs(scroller.scrollTop - scrollTarget) <= 1
          : anchorInView(el) !== 'none';
        if ((settled && arrived) || Date.now() - scrollSince > MAX_MOTION_MS) {
          scroll = 'done';
          centred = !!scroller;
        }
      }
      const waiting = scroll === 'pending' || scroll === 'scrolling';
      // The spotlight, cursor and click only get a rect the teacher can see.
      if (waiting || anchorInView(el) === 'none') {
        publish({ element: null, rect: null, status: 'searching' });
        if (!waiting && missTimer === undefined) startMissTimer();
      } else {
        stopMissTimer();
        // A wildcard step lights every row on screen, so the teacher can pick any of them.
        const rows = anyRow
          ? findTourAnchors(target, {
              widgetIds,
              slots,
              accept: (m) => isAnchorReachable(m) && anchorInView(m) !== 'none',
            })
          : [];
        const matches = rows.includes(el)
          ? [el, ...rows.filter((m) => m !== el)]
          : [el, ...rows];
        publish({
          element: el,
          rect:
            matches.length > 1
              ? unionRect(matches.map((m) => m.getBoundingClientRect()))
              : next,
          status: 'found',
          ...(anyRow ? { matches } : {}),
          ...(centred ? { centred } : {}),
        });
      }
      // Keep following while it moves or scrolls; stop reading layout once it settles.
      if (!settled || waiting) schedule();
    };

    const track = (found: HTMLElement) => {
      element = found;
      lastRect = null;
      stopMissTimer();
      if (!scrolled) {
        scrolled = true;
        scroller = drawerScroller(found);
        if (scroller) {
          scroll = 'pending';
        } else {
          const hidden = anchorInView(found) !== 'full';
          found.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
          if (hidden && scrollParent(found)) {
            scroll = 'scrolling';
            scrollSince = Date.now();
          }
        }
      }
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(found);
      }
      measure();
    };

    const runSearch = (fullOnly = false) => {
      clearTimeout(searchTimer);
      searchTimer = undefined;
      if (cancelled || element) return;
      // Mid-transition, only a control already fully on screen counts, so nothing scrolls a moving panel.
      const accept = fullOnly
        ? (el: Element) => isAnchorReachable(el) && anchorInView(el) === 'full'
        : isAnchorReachable;
      const opts = { widgetIds, slots, accept };
      let found = idOnly ? findTourAnchor(idOnly, opts) : null;
      if (!found && target.fallback) {
        const wait = lastFallback + ANCHOR_SEARCH_THROTTLE_MS - Date.now();
        if (wait <= 0) {
          lastFallback = Date.now();
          found = findTourAnchor(target, opts);
        } else if (!fullOnly) {
          searchTimer = setTimeout(() => runSearch(), wait);
        }
      }
      if (found) track(found);
    };

    const requestSearch = () => {
      if (cancelled || element || searchRaf) return;
      searchRaf = requestAnimationFrame(() => {
        searchRaf = 0;
        runSearch();
      });
    };

    // While something on the page animates, look every frame (bounded) instead of waiting for it to end.
    let followRaf = 0;
    const followOpening = () => {
      if (followRaf || cancelled || element) return;
      followRaf = requestAnimationFrame(() => {
        followRaf = 0;
        if (cancelled || element) return;
        const now = Date.now();
        opening.forEach((at, t) => {
          if (now - at > MAX_MOTION_MS) opening.delete(t);
        });
        if (opening.size === 0) return;
        runSearch(true);
        followOpening();
      });
    };

    function stopMissTimer() {
      clearTimeout(missTimer);
      missTimer = undefined;
    }

    function startMissTimer() {
      clearTimeout(missTimer);
      missTimer = setTimeout(
        () => publish({ element: null, rect: null, status: 'missing' }),
        ANCHOR_SEARCH_MS
      );
    }

    function lose() {
      element = null;
      lastRect = null;
      moving.clear();
      resizeObserver?.disconnect();
      resizeObserver = null;
      publish({ element: null, rect: null, status: 'searching' });
      startMissTimer();
      runSearch();
    }

    const affectsElement = (records: MutationRecord[], el: HTMLElement) =>
      records.some(
        (r) =>
          r.target.contains(el) ||
          Array.from(r.removedNodes).some((n) => n.contains(el))
      );

    const mutations = new MutationObserver((records) => {
      if (records.every((r) => isTourUi(r.target))) return;
      if (!element) requestSearch();
      // Rows can come and go anywhere in a wildcard step's list.
      else if (anyRow || affectsElement(records, element)) schedule();
    });
    // Panels portal to <body>, so the whole page is the board root.
    mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: WATCHED_ATTRS,
    });

    const onViewport = () => {
      if (element) schedule();
      else requestSearch();
    };
    const onMotionStart = (e: Event) => {
      if (!element) {
        if (idOnly && e.target instanceof Node && !isTourUi(e.target)) {
          opening.set(e.target, Date.now());
          followOpening();
        }
        return;
      }
      if (e.target instanceof Node && e.target.contains(element)) {
        moving.set(e.target, Date.now());
        schedule();
      }
    };
    const onMotionEnd = (e: Event) => {
      if (!element) {
        if (e.target) opening.delete(e.target);
        if (e.target instanceof Node && !isTourUi(e.target)) requestSearch();
        return;
      }
      if (e.target && moving.delete(e.target)) schedule();
    };
    window.addEventListener('scroll', onViewport, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', onViewport);
    MOTION_START.forEach((t) =>
      document.addEventListener(t, onMotionStart, true)
    );
    MOTION_END.forEach((t) => document.addEventListener(t, onMotionEnd, true));

    startMissTimer();
    runSearch();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(searchRaf);
      cancelAnimationFrame(followRaf);
      clearTimeout(searchTimer);
      clearTimeout(missTimer);
      mutations.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', onViewport, { capture: true });
      window.removeEventListener('resize', onViewport);
      MOTION_START.forEach((t) =>
        document.removeEventListener(t, onMotionStart, true)
      );
      MOTION_END.forEach((t) =>
        document.removeEventListener(t, onMotionEnd, true)
      );
    };
  }, [
    searchable,
    anchor,
    fallbackRole,
    fallbackName,
    scopeKey,
    boundId,
    requestKey,
    anyRow,
  ]);

  if (!searchable) return IDLE;
  if (state.key !== requestKey) {
    return { element: null, rect: null, status: 'searching' };
  }
  return {
    element: state.element,
    rect: state.rect,
    status: state.status,
    ...(state.matches ? { matches: state.matches } : {}),
    ...(state.centred ? { centred: true } : {}),
  };
}

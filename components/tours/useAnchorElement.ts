import { useEffect, useState } from 'react';
import type { GuidedLearningTourBinding } from '@/types';
import {
  findTourAnchor,
  isAnchorVisible,
  type TourAnchorScope,
} from './resolveTourAnchor';

/** How long a step searches before it reports `missing`; it keeps watching after that. */
export const ANCHOR_SEARCH_MS = 3000;
/** Minimum gap between DOM searches while the anchor is missing. */
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
}

const IDLE: AnchorState = { element: null, rect: null, status: 'idle' };

const sameRect = (a: DOMRect | null, b: DOMRect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height);

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
    let raf = 0;
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    let missTimer: ReturnType<typeof setTimeout> | undefined;
    let lastSearch = -Infinity;
    let resizeObserver: ResizeObserver | null = null;
    // Transitions running on the anchor or an ancestor, by start time.
    const moving = new Map<EventTarget, number>();

    const publish = (next: AnchorState) =>
      setState((prev) =>
        prev.key === key &&
        prev.status === next.status &&
        prev.element === next.element &&
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
      if (!el.isConnected || !isAnchorVisible(el)) {
        lose();
        return;
      }
      const next = el.getBoundingClientRect();
      const moved = !sameRect(lastRect, next);
      lastRect = next;
      publish({ element: el, rect: next, status: 'found' });
      // Keep following while it moves; stop reading layout once it settles.
      if (moved || stillMoving()) schedule();
    };

    const track = (found: HTMLElement) => {
      element = found;
      lastRect = null;
      clearTimeout(missTimer);
      if (!scrolled) {
        scrolled = true;
        found.scrollIntoView?.({ block: 'nearest' });
      }
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(found);
      }
      measure();
    };

    const runSearch = () => {
      searchTimer = undefined;
      if (cancelled || element) return;
      lastSearch = Date.now();
      const found = findTourAnchor(target, { widgetIds, slots });
      if (found) track(found);
    };

    const requestSearch = () => {
      if (cancelled || element || searchTimer !== undefined) return;
      const wait = Math.max(
        0,
        lastSearch + ANCHOR_SEARCH_THROTTLE_MS - Date.now()
      );
      searchTimer = setTimeout(runSearch, wait);
    };

    const startMissTimer = () => {
      clearTimeout(missTimer);
      missTimer = setTimeout(
        () => publish({ element: null, rect: null, status: 'missing' }),
        ANCHOR_SEARCH_MS
      );
    };

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
      else if (affectsElement(records, element)) schedule();
    });
    // Panels portal to <body>, so the whole page is the board root.
    mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: WATCHED_ATTRS,
    });

    const onViewport = () => schedule();
    const onMotionStart = (e: Event) => {
      if (!element) return;
      if (e.target instanceof Node && e.target.contains(element)) {
        moving.set(e.target, Date.now());
        schedule();
      }
    };
    const onMotionEnd = (e: Event) => {
      if (!element) {
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
  ]);

  if (!searchable) return IDLE;
  if (state.key !== requestKey) {
    return { element: null, rect: null, status: 'searching' };
  }
  return { element: state.element, rect: state.rect, status: state.status };
}

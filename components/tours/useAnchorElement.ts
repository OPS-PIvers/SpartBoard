import { useEffect, useState } from 'react';
import type { GuidedLearningTourBinding } from '@/types';
import { findTourAnchor, type TourAnchorScope } from './resolveTourAnchor';

export const ANCHOR_SEARCH_MS = 3000;

export interface AnchorState {
  element: HTMLElement | null;
  rect: DOMRect | null;
  status: 'idle' | 'searching' | 'found' | 'missing';
}

const IDLE: AnchorState = { element: null, rect: null, status: 'idle' };

const sameRect = (a: DOMRect | null, b: DOMRect) =>
  !!a &&
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height;

/** Finds a tour anchor (polling for up to 3s) and tracks its viewport rect. */
export function useAnchorElement(
  binding: Pick<GuidedLearningTourBinding, 'anchor' | 'fallback'> | null,
  scope: TourAnchorScope,
  attempt = 0
): AnchorState {
  const anchor = binding?.anchor ?? null;
  const fallbackRole = binding?.fallback?.role;
  const fallbackName = binding?.fallback?.name;
  const scopeKey = (scope.widgetIds ?? []).join(',');
  const requestKey = [
    anchor,
    fallbackRole,
    fallbackName,
    scopeKey,
    attempt,
  ].join('|');
  const [state, setState] = useState<AnchorState & { key: string }>({
    ...IDLE,
    key: '',
  });

  useEffect(() => {
    if (!anchor) return;
    const key = requestKey;
    const target = {
      anchor,
      fallback:
        fallbackRole && fallbackName
          ? { role: fallbackRole, name: fallbackName }
          : undefined,
    };
    const widgetIds = scopeKey ? scopeKey.split(',') : [];
    let raf = 0;
    let cancelled = false;
    let element: HTMLElement | null = null;
    let started = performance.now();

    const search = () => {
      if (cancelled) return;
      const found = findTourAnchor(target, { widgetIds });
      if (found) {
        element = found;
        raf = requestAnimationFrame(track);
        return;
      }
      if (performance.now() - started >= ANCHOR_SEARCH_MS) {
        setState({ element: null, rect: null, status: 'missing', key });
        return;
      }
      raf = requestAnimationFrame(search);
    };
    // Widgets move by transform and panels animate open, so re-measure every frame.
    const track = () => {
      if (cancelled || !element) return;
      if (!element.isConnected) {
        element = null;
        started = performance.now();
        search();
        return;
      }
      const el = element;
      const next = el.getBoundingClientRect();
      setState((prev) =>
        prev.key === key && prev.element === el && sameRect(prev.rect, next)
          ? prev
          : { element: el, rect: next, status: 'found', key }
      );
      raf = requestAnimationFrame(track);
    };

    search();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [anchor, fallbackRole, fallbackName, scopeKey, requestKey]);

  if (!anchor) return IDLE;
  if (state.key !== requestKey) {
    return { element: null, rect: null, status: 'searching' };
  }
  return { element: state.element, rect: state.rect, status: state.status };
}

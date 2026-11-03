import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { WidgetType } from '@/types';

// The student link each on-board widget shows now, kept in memory so a following QR stays current without writes.
const links = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

/** Widget types a QR code can follow for their student link. */
export const LINK_LEADER_TYPES: ReadonlySet<WidgetType> = new Set<WidgetType>([
  'activity-wall',
  'miniApp',
]);

export const publishWidgetShareLink = (
  widgetId: string,
  url: string | undefined
): void => {
  if (url) {
    if (links.get(widgetId) === url) return;
    links.set(widgetId, url);
  } else {
    if (!links.has(widgetId)) return;
    links.delete(widgetId);
  }
  listeners.get(widgetId)?.forEach((fn) => fn());
};

export const getWidgetShareLink = (widgetId: string): string | undefined =>
  links.get(widgetId);

const subscribe = (widgetId: string, fn: () => void) => {
  let set = listeners.get(widgetId);
  if (!set) {
    set = new Set();
    listeners.set(widgetId, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(widgetId);
  };
};

const noop = () => () => undefined;
const none = () => undefined;

export const useWidgetShareLink = (
  widgetId: string | undefined
): string | undefined => {
  const sub = useCallback(
    (fn: () => void) => (widgetId ? subscribe(widgetId, fn) : noop()),
    [widgetId]
  );
  const get = useCallback(
    () => (widgetId ? links.get(widgetId) : none()),
    [widgetId]
  );
  return useSyncExternalStore(sub, get);
};

/** Publishes this widget's link while it is mounted; pass undefined when it has none. */
export const usePublishWidgetShareLink = (
  widgetId: string,
  url: string | undefined
): void => {
  useEffect(() => {
    publishWidgetShareLink(widgetId, url);
  }, [widgetId, url]);
  useEffect(
    () => () => publishWidgetShareLink(widgetId, undefined),
    [widgetId]
  );
};

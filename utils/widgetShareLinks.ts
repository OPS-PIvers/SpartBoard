import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { WidgetType } from '@/types';

// The student link each on-board widget shows now, kept in memory so a following QR stays current without writes.
// Keyed by widget id, then by publisher, so a copy of the widget (student view, announcement) can't clear the board's link.
const links = new Map<string, Map<symbol, string>>();
const listeners = new Map<string, Set<() => void>>();

/** Widget types a QR code can follow for their student link. */
export const LINK_LEADER_TYPES: ReadonlySet<WidgetType> = new Set<WidgetType>([
  'activity-wall',
  'miniApp',
]);

export const getWidgetShareLink = (widgetId: string): string | undefined => {
  const byPublisher = links.get(widgetId);
  if (!byPublisher) return undefined;
  let latest: string | undefined;
  for (const url of byPublisher.values()) latest = url;
  return latest;
};

export const publishWidgetShareLink = (
  widgetId: string,
  publisher: symbol,
  url: string | undefined
): void => {
  const before = getWidgetShareLink(widgetId);
  let byPublisher = links.get(widgetId);
  if (url) {
    if (!byPublisher) {
      byPublisher = new Map();
      links.set(widgetId, byPublisher);
    }
    byPublisher.delete(publisher);
    byPublisher.set(publisher, url);
  } else if (byPublisher) {
    byPublisher.delete(publisher);
    if (byPublisher.size === 0) links.delete(widgetId);
  }
  if (getWidgetShareLink(widgetId) !== before) {
    listeners.get(widgetId)?.forEach((fn) => fn());
  }
};

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
    () => (widgetId ? getWidgetShareLink(widgetId) : none()),
    [widgetId]
  );
  return useSyncExternalStore(sub, get);
};

/** Publishes this widget's link while it is mounted; pass undefined when it has none. */
export const usePublishWidgetShareLink = (
  widgetId: string,
  url: string | undefined
): void => {
  const [publisher] = useState(() => Symbol(widgetId));
  useEffect(() => {
    publishWidgetShareLink(widgetId, publisher, url);
    return () => publishWidgetShareLink(widgetId, publisher, undefined);
  }, [widgetId, publisher, url]);
};

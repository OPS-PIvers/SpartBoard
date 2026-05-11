/**
 * Shared registry of widget DOM refs — all DraggableWindow instances register here
 * so group drag/resize can manipulate sibling widgets' DOM elements directly.
 */
export const widgetRefRegistry = new Map<string, HTMLDivElement>();

/**
 * Transient render-time position/size override for siblings during an active
 * group drag or resize. The leader writes per-sibling overrides each RAF tick;
 * each sibling's DraggableWindow subscribes to its own entry and renders from
 * the override instead of widget.x/y so React re-renders (e.g. bringToFront
 * raising every group member's z) don't snap siblings back to their stale
 * prop positions.
 *
 * Identity invariant: every set() replaces the Override object rather than
 * mutating it in place, so useSyncExternalStore snapshot equality works.
 *
 * Shape invariant: w/h must be set together (group resize) or both omitted
 * (group drag — position-only). The discriminated union prevents callers
 * from accidentally setting one dimension without the other, which would
 * break aspect ratio with no runtime signal.
 */
export type WidgetOverride =
  | { x: number; y: number; w?: undefined; h?: undefined }
  | { x: number; y: number; w: number; h: number };

const overrides = new Map<string, WidgetOverride>();
const listeners = new Map<string, Set<() => void>>();

export function setWidgetOverride(
  id: string,
  value: WidgetOverride | null
): void {
  if (value == null) {
    if (!overrides.has(id)) return;
    overrides.delete(id);
  } else {
    overrides.set(id, value);
  }
  const set = listeners.get(id);
  if (set) {
    for (const fn of set) fn();
  }
}

export function getWidgetOverride(id: string): WidgetOverride | undefined {
  return overrides.get(id);
}

export function subscribeWidgetOverride(
  id: string,
  fn: () => void
): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(fn);
  return () => {
    const current = listeners.get(id);
    if (!current) return;
    current.delete(fn);
    if (current.size === 0) listeners.delete(id);
  };
}

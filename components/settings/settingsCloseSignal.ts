// Module-level "settings just closed" signal (§4.5). Written by both close
// paths (floating panel and drawer), read by DraggableWindow's Escape chain.
// Scoped by widgetId — teachers can have more than one widget's settings on
// screen (multiple floating panels, or a drawer close on one widget followed
// by an Escape on another) within the freshness window, so an unscoped
// signal would let widget A's close suppress widget B's unrelated Escape.

/** Freshness window: long enough for the same synchronous keydown dispatch. */
const FRESHNESS_MS = 50;

let closedAt = 0;
let closedWidgetId: string | null = null;
let gestureAt = 0;
let gestureWidgetId: string | null = null;

const now = (): number => Date.now();

/** Marks a settings surface as closed by an explicit close action. */
export const markSettingsJustClosed = (widgetId: string): void => {
  closedAt = now();
  closedWidgetId = widgetId;
};

/** True while `widgetId`'s close is fresh enough to suppress a redundant Escape write. */
export const wasSettingsJustClosed = (
  widgetId: string,
  at: number = now()
): boolean =>
  closedWidgetId === widgetId &&
  closedAt !== 0 &&
  at - closedAt <= FRESHNESS_MS &&
  at >= closedAt;

/** One-shot read for `widgetId`: true while fresh, and clears so no later Escape is suppressed. */
export const consumeSettingsJustClosed = (widgetId: string): boolean => {
  const fresh = wasSettingsJustClosed(widgetId);
  if (fresh) {
    closedAt = 0;
    closedWidgetId = null;
  }
  return fresh;
};

/** Marks a close caused by a widget drag/resize gesture: the camera is not restored. */
export const markSettingsClosedByGesture = (widgetId: string): void => {
  gestureAt = now();
  gestureWidgetId = widgetId;
};

/** True while `widgetId`'s gesture-driven close is fresh. */
export const wasSettingsClosedByGesture = (
  widgetId: string,
  at: number = now()
): boolean =>
  gestureWidgetId === widgetId &&
  gestureAt !== 0 &&
  at - gestureAt <= FRESHNESS_MS &&
  at >= gestureAt;

/** Test-only reset. */
export const resetSettingsCloseSignal = (): void => {
  closedAt = 0;
  closedWidgetId = null;
  gestureAt = 0;
  gestureWidgetId = null;
};

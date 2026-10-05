// Shared shape of the unmapped live-tour anchor queue; must match components/tours/anchorQueue.ts.
export const TOUR_ANCHOR_QUEUE = 'tour_anchor_queue';
export const TOUR_ANCHOR_BATCHES = 'tour_anchor_batches';

// sha-1 hex, as the client writes it.
export const FINGERPRINT_RE = /^[0-9a-f]{40}$/;
// A step ref: an `area.thing` registry id, then optional `:<widgetType>` and `#<fieldKey>`.
export const ANCHOR_REF_RE =
  /^[a-z0-9]+(?:[.-][a-z0-9]+)+(?::[A-Za-z0-9-]+)?(?:#[A-Za-z0-9_.-]+)?$/;

export const DAY_MS = 24 * 60 * 60 * 1000;

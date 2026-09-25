// Shared shape of the unmapped live-tour anchor queue; must match components/tours/anchorQueue.ts.
export const TOUR_ANCHOR_QUEUE = 'tour_anchor_queue';
export const TOUR_ANCHOR_BATCHES = 'tour_anchor_batches';

// sha-1 hex, as the client writes it.
export const FINGERPRINT_RE = /^[0-9a-f]{40}$/;
// Registry ids look like `area.thing`, with dotted or dashed segments.
export const ANCHOR_ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;

export const DAY_MS = 24 * 60 * 60 * 1000;

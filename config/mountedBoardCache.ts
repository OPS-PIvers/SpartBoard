/**
 * Maximum number of Boards mounted at any moment. This is the TOTAL
 * cap — pinned Boards (live-session hosts) and LRU Boards share this
 * budget. Pinned slots reduce the LRU window correspondingly. There is
 * a safety floor: at least one slot is always reserved for the active
 * Board even if all other slots are pinned.
 *
 * Default 2: enough to make "switch to look up something, switch back"
 * preserve drawing/timer/video state on the originating Board. Higher
 * values risk audio-context fights, webcam contention, and unbounded
 * Firestore subscriptions in hidden Boards' widgets.
 */
export const MOUNTED_BOARD_CACHE_SIZE = 2;

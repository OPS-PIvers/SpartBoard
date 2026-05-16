/**
 * Number of Boards held mounted at any moment. Active Board + (N-1)
 * most-recently-touched. Live-session-active Boards are pinned in
 * addition to the LRU set (never evicted while the session is live).
 *
 * Default 2: enough to make "switch to look up something, switch back"
 * preserve drawing/timer/video state on the originating Board. Higher
 * values risk audio-context fights, webcam contention, and unbounded
 * Firestore subscriptions in hidden Boards' widgets.
 */
export const MOUNTED_BOARD_CACHE_SIZE = 2;

// Throttles the per-member `lastActive` self-write to once per hour per browser.
// Without this, every full reload re-arms the in-memory ref and writes again,
// which (across hundreds of teachers reloading several times daily) funnels
// thousands of writes/day through one document and inflates rules `get()` cost.

const ONE_HOUR_MS = 60 * 60 * 1000;

export const LAST_ACTIVE_THROTTLE_MS = ONE_HOUR_MS;

export const lastActiveStorageKey = (uid: string, orgId: string): string =>
  `spart:lastActive:${uid}:${orgId}`;

/**
 * Returns true if a `lastActive` write should occur for this (uid, orgId)
 * right now, and (when true) eagerly stamps localStorage with `nowMs` so a
 * second tab racing the same write skips. If localStorage is unavailable
 * (private mode, quota exceeded, SSR), returns true so callers fall back to
 * the existing once-per-JS-context behavior rather than throwing.
 */
export const shouldWriteLastActive = (
  uid: string,
  orgId: string,
  nowMs: number = Date.now(),
  storage: Storage | null = typeof localStorage === 'undefined'
    ? null
    : localStorage
): boolean => {
  if (!storage) return true;

  const key = lastActiveStorageKey(uid, orgId);

  try {
    const raw = storage.getItem(key);
    if (raw) {
      const lastMs = Date.parse(raw);
      if (!Number.isNaN(lastMs) && nowMs - lastMs < ONE_HOUR_MS) {
        return false;
      }
    }
    storage.setItem(key, new Date(nowMs).toISOString());
    return true;
  } catch {
    return true;
  }
};

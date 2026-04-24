// Throttles the per-member `lastActive` self-write to once per hour per browser.
// Without this, every full reload re-arms the in-memory ref and writes again,
// which (across hundreds of teachers reloading several times daily) funnels
// thousands of writes/day through one document and inflates rules `get()` cost.

const ONE_HOUR_MS = 60 * 60 * 1000;

export const LAST_ACTIVE_THROTTLE_MS = ONE_HOUR_MS;

export const lastActiveStorageKey = (uid: string, orgId: string): string =>
  `spart:lastActive:${uid}:${orgId}`;

const resolveStorage = (
  storage: Storage | null | undefined
): Storage | null => {
  if (storage !== undefined) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
};

/**
 * Read-only check: returns true if a `lastActive` write is due for this
 * (uid, orgId) right now. Does NOT stamp localStorage — callers must call
 * {@link stampLastActive} only after the Firestore write succeeds, so a
 * transient write failure doesn't consume the throttle window.
 *
 * If localStorage is unavailable (private mode, quota exceeded, SSR),
 * returns true so callers fall back to the existing once-per-JS-context
 * behavior rather than throwing.
 */
export const canWriteLastActive = (
  uid: string,
  orgId: string,
  nowMs: number = Date.now(),
  storage?: Storage | null
): boolean => {
  const store = resolveStorage(storage);
  if (!store) return true;

  try {
    const raw = store.getItem(lastActiveStorageKey(uid, orgId));
    if (!raw) return true;
    const lastMs = Date.parse(raw);
    if (Number.isNaN(lastMs)) return true;
    return nowMs - lastMs >= ONE_HOUR_MS;
  } catch {
    return true;
  }
};

/**
 * Stamps localStorage to record that a `lastActive` write just succeeded.
 * Call this only after the Firestore write resolves — calling before (or
 * unconditionally) silently extends the staleness window by up to an hour
 * on any transient write failure.
 *
 * Silently no-ops when storage is unavailable or the write throws (quota
 * exceeded, private mode). Not returning a value here keeps call sites
 * short and reflects that a failed stamp just means the next reload will
 * re-check via {@link canWriteLastActive} and (harmlessly) try again.
 */
export const stampLastActive = (
  uid: string,
  orgId: string,
  nowMs: number = Date.now(),
  storage?: Storage | null
): void => {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(
      lastActiveStorageKey(uid, orgId),
      new Date(nowMs).toISOString()
    );
  } catch {
    // ignore
  }
};

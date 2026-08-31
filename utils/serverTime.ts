import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';

/**
 * Best-effort server-clock offset (spec M17 §3a-D: window comparisons must
 * use server-offset time, not raw `Date.now()`). SpartBoard has no Realtime
 * Database (`.info/serverTimeOffset` isn't available), so this uses the
 * Firestore `serverTimestamp()` round-trip pattern: write a per-user scratch
 * doc with a `serverTimestamp()` field, then diff the server-resolved value
 * against local `Date.now()` once the write round-trips. The offset is
 * approximate (network latency isn't isolated — we split the round trip
 * evenly) but sufficient as a clock-skew guard; it is NOT used for anything
 * security-sensitive (server-side `closeAt` enforcement lives in
 * firestore.rules and doesn't trust the client clock either way).
 */

let offsetMs = 0;
let syncedForUid: string | null = null;

/** Server-offset "now" — use this instead of `Date.now()` for window checks. */
export function getServerNow(): number {
  return Date.now() + offsetMs;
}

/** @internal — test-only reset hook. */
export function __resetServerTimeSyncForTests(): void {
  offsetMs = 0;
  syncedForUid = null;
}

/**
 * Kicks off a one-time server-time sync for `uid`. Safe to call repeatedly —
 * it no-ops once a sync has been started for the given uid. Writes/reads
 * `/server_time_probe/{uid}`, which firestore.rules restricts to
 * `request.auth.uid == uid` (read + write), so any signed-in user (teacher
 * or student) can call this with their own uid.
 */
export function syncServerTime(uid: string | null | undefined): void {
  if (isAuthBypass || !uid || syncedForUid === uid) return;
  syncedForUid = uid;
  // Defensive try/catch: `db` can be a test double (or unconfigured) in
  // environments that never call the real Firestore SDK — this sync is a
  // best-effort clock-skew guard, never a hard dependency, so a synchronous
  // SDK error here must never take down the caller.
  try {
    const ref = doc(db, 'server_time_probe', uid);
    const localWriteAt = Date.now();
    void setDoc(ref, { at: serverTimestamp() }).catch(() => {
      if (syncedForUid === uid) syncedForUid = null;
    });
    const unsub = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const at = snap.data()?.at as { toMillis?: () => number } | undefined;
        if (at && typeof at.toMillis === 'function') {
          const serverMillis = at.toMillis();
          const receivedAt = Date.now();
          offsetMs = serverMillis - (localWriteAt + receivedAt) / 2;
        }
        unsub();
      },
      () => {
        if (syncedForUid === uid) syncedForUid = null;
        unsub();
      }
    );
  } catch {
    syncedForUid = null;
  }
}

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

const REFRESH_EVERY_MS = 20 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const storageKey = (uid: string) => `spart.verifiedClassesAt.${uid}`;
const inFlight = new Set<string>();

function readStamp(uid: string): number {
  try {
    return Number(localStorage.getItem(storageKey(uid))) || 0;
  } catch {
    return 0;
  }
}

function writeStamp(uid: string, at: number): void {
  try {
    localStorage.setItem(storageKey(uid), String(at));
  } catch {
    // Storage blocked: the next load refreshes again.
  }
}

/** Refreshes the server's list of classes this teacher may assign to, at most about once a day. */
export async function refreshVerifiedClassesIfStale(
  uid: string,
  now: number = Date.now()
): Promise<void> {
  if (inFlight.has(uid) || now - readStamp(uid) < REFRESH_EVERY_MS) return;
  inFlight.add(uid);
  try {
    const { data } = await httpsCallable<
      Record<string, never>,
      { count: number; classlinkAt: number | null }
    >(
      functions,
      'refreshMyClassesV1'
    )({});
    // Retry in about an hour when ClassLink has never answered for this teacher.
    writeStamp(
      uid,
      data.classlinkAt !== null ? now : now - REFRESH_EVERY_MS + RETRY_MS
    );
  } catch (err) {
    console.warn('[verifiedClasses] refresh failed:', err);
  } finally {
    inFlight.delete(uid);
  }
}

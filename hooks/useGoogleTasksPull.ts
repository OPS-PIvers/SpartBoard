import { useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import {
  applyActionItemDoneChanges,
  readPlcNoteCollabEnabled,
  type ActionItemDoneChange,
} from '@/utils/plcActionItemDone';

export const GOOGLE_TASKS_PULL_INTERVAL_MS = 2 * 60 * 1000;

const throttleKey = (uid: string) => `spart_gtasks_pull_${uid}`;
// Fallback when localStorage is unavailable (private mode, blocked storage).
const memoryStamps = new Map<string, number>();

/** Claims the pull slot for this user; false when one ran within the interval. */
export function claimGoogleTasksPull(uid: string, now: number): boolean {
  let last = memoryStamps.get(uid) ?? 0;
  try {
    const stored = Number(localStorage.getItem(throttleKey(uid)));
    if (Number.isFinite(stored) && stored > last) last = stored;
  } catch {
    // Storage blocked; the in-memory stamp still throttles this tab.
  }
  if (now - last < GOOGLE_TASKS_PULL_INTERVAL_MS) return false;
  memoryStamps.set(uid, now);
  try {
    localStorage.setItem(throttleKey(uid), String(now));
  } catch {
    // Storage blocked; the in-memory stamp still throttles this tab.
  }
  return true;
}

/** Pulls Google Tasks completions for the caller and applies them to action items. */
export function useGoogleTasksPull(
  plcId: string | null,
  enabled: boolean
): void {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!enabled || !uid || isAuthBypass) return;
    if (!claimGoogleTasksPull(uid, Date.now())) return;
    const pull = httpsCallable<
      { plcId?: string },
      { changes: ActionItemDoneChange[] }
    >(functions, 'pullGoogleTasksStatusV1');
    void (async () => {
      try {
        const [result, collab] = await Promise.all([
          pull(plcId ? { plcId } : {}),
          readPlcNoteCollabEnabled(),
        ]);
        const changes = result.data?.changes ?? [];
        // Unmount doesn't cancel: the server has already marked these as known.
        if (auth.currentUser?.uid !== uid || changes.length === 0) return;
        await applyActionItemDoneChanges(changes, uid, { collab });
      } catch (err) {
        logError('useGoogleTasksPull', err, { plcId });
      }
    })();
  }, [plcId, enabled, uid]);
}

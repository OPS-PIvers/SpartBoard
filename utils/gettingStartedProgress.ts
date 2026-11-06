import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { viewAsBlocksWrite } from '@/utils/viewAsTab';

/** Per-teacher progress, readable across devices because a tour's `runs/{uid}` is write-only (D13). */
export interface GettingStartedProgress {
  /** Set id to the time this teacher last finished that tour. */
  finished: Record<string, number>;
}

export const EMPTY_GETTING_STARTED_PROGRESS: GettingStartedProgress = {
  finished: {},
};

export const gettingStartedProgressRef = (uid: string) =>
  doc(db, 'users', uid, 'userProfile', 'gettingStarted');

export function normalizeGettingStartedProgress(
  raw: unknown
): GettingStartedProgress {
  const finished = (raw as { finished?: unknown } | undefined)?.finished;
  if (!finished || typeof finished !== 'object') {
    return EMPTY_GETTING_STARTED_PROGRESS;
  }
  return {
    finished: Object.fromEntries(
      Object.entries(finished).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    ),
  };
}

/** Best effort: a lost write only leaves a finished tour unchecked until it's replayed. */
export async function recordTourFinished(
  uid: string,
  setId: string
): Promise<void> {
  if (isAuthBypass || viewAsBlocksWrite()) return;
  try {
    await setDoc(
      gettingStartedProgressRef(uid),
      { finished: { [setId]: Date.now() } },
      { merge: true }
    );
  } catch (err) {
    logError('recordTourFinished', err, { setId });
  }
}

/** Clears this teacher's own progress so an admin can test the flow again (D29). */
export async function resetGettingStartedProgress(uid: string): Promise<void> {
  if (isAuthBypass || viewAsBlocksWrite()) return;
  await deleteDoc(gettingStartedProgressRef(uid));
}

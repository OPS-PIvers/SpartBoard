import { doc, runTransaction, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { viewAsBlocksWrite } from '@/utils/viewAsTab';

/** Per-teacher progress, readable across devices because a tour's `runs/{uid}` is write-only (D13). */
export interface GettingStartedProgress {
  /** Set id to the time this teacher last finished that tour. */
  finished: Record<string, number>;
  /** Set when the app made a brand-new account's first board (D3); the welcome shows while pending (D1, D5). */
  welcome?: 'pending' | 'dismissed';
  /** When that happened, the start of the quiet-start window (D7). */
  firstSignInAt?: number;
  /** When the teacher was first seen with every Essentials tour done, which ends quiet start. */
  essentialsDoneAt?: number;
}

/** Quiet start lasts at most this long after the first sign-in (Set at build, D7). */
export const QUIET_START_MS = 7 * 24 * 60 * 60 * 1000;

/** True while a brand-new teacher's first week is held quiet: Essentials not done and within the limit (D7). */
export const isQuietStart = (
  progress: GettingStartedProgress,
  now: number
): boolean =>
  progress.firstSignInAt !== undefined &&
  progress.essentialsDoneAt === undefined &&
  now - progress.firstSignInAt < QUIET_START_MS;

/** A Google account this new is still signing in for the first time, not a veteran who deleted every board. */
export const BRAND_NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;

export const EMPTY_GETTING_STARTED_PROGRESS: GettingStartedProgress = {
  finished: {},
};

export const gettingStartedProgressRef = (uid: string) =>
  doc(db, 'users', uid, 'userProfile', 'gettingStarted');

export function normalizeGettingStartedProgress(
  raw: unknown
): GettingStartedProgress {
  const data = (raw ?? {}) as {
    finished?: unknown;
    welcome?: unknown;
    firstSignInAt?: unknown;
    essentialsDoneAt?: unknown;
  };
  const finished =
    data.finished && typeof data.finished === 'object'
      ? Object.fromEntries(
          Object.entries(data.finished).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number'
          )
        )
      : {};
  return {
    finished,
    ...(data.welcome === 'pending' || data.welcome === 'dismissed'
      ? { welcome: data.welcome }
      : {}),
    ...(typeof data.firstSignInAt === 'number'
      ? { firstSignInAt: data.firstSignInAt }
      : {}),
    ...(typeof data.essentialsDoneAt === 'number'
      ? { essentialsDoneAt: data.essentialsDoneAt }
      : {}),
  };
}

/** Records that every Essentials tour is done, which ends quiet start; a lost write only keeps it until the 7-day limit. */
export async function markEssentialsDone(uid: string): Promise<void> {
  if (isAuthBypass || viewAsBlocksWrite()) return;
  try {
    await setDoc(
      gettingStartedProgressRef(uid),
      { essentialsDoneAt: Date.now() },
      { merge: true }
    );
  } catch (err) {
    logError('markEssentialsDone', err);
  }
}

/** Marks a brand-new account once, when the app makes its first board (D3); never a veteran's. */
export async function markFirstRun(
  uid: string,
  accountCreatedAt: number | null
): Promise<void> {
  if (isAuthBypass || viewAsBlocksWrite()) return;
  if (
    accountCreatedAt === null ||
    !Number.isFinite(accountCreatedAt) ||
    Date.now() - accountCreatedAt > BRAND_NEW_ACCOUNT_MS
  )
    return;
  try {
    await runTransaction(db, async (tx) => {
      const ref = gettingStartedProgressRef(uid);
      const snap = await tx.get(ref);
      if (snap.exists() && typeof snap.data().firstSignInAt === 'number')
        return;
      tx.set(
        ref,
        { welcome: 'pending', firstSignInAt: Date.now() },
        { merge: true }
      );
    });
  } catch (err) {
    logError('markFirstRun', err);
  }
}

/** Start or Later on the welcome; it never pops up again after this (D5). */
export async function dismissWelcome(uid: string): Promise<void> {
  if (isAuthBypass || viewAsBlocksWrite()) return;
  try {
    await setDoc(
      gettingStartedProgressRef(uid),
      { welcome: 'dismissed' },
      { merge: true }
    );
  } catch (err) {
    logError('dismissWelcome', err);
  }
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

/** Clears this teacher's own checkmarks and brings the welcome back, so an admin can test the flow again (D29). */
export async function resetGettingStartedProgress(uid: string): Promise<void> {
  if (isAuthBypass || viewAsBlocksWrite()) return;
  await setDoc(gettingStartedProgressRef(uid), {
    finished: {},
    welcome: 'pending',
    firstSignInAt: Date.now(),
  });
}

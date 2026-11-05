// Client side of Mini App results v2 (docs/plans/shipped/MINI_APP_RESULTS.md).
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import type { AssignmentMode, GlobalFeature, MiniAppAnswerKey } from '@/types';
import { logError } from '@/utils/logError';

/** Results v2 needs the preview flag AND Mini App submissions on in Organization settings. */
export const miniAppResultsOn = (
  canAccessFeature: (id: GlobalFeature) => boolean,
  assignmentMode: AssignmentMode
): boolean =>
  assignmentMode === 'submissions' && canAccessFeature('mini-app-results');

export interface MiniAppResultsChoice {
  attemptLimit: number | null;
  showCorrectAnswers: boolean;
}

/** D8/D9 defaults: one attempt, score and right or wrong shown. */
export const DEFAULT_MINI_APP_RESULTS: MiniAppResultsChoice = {
  attemptLimit: 1,
  showCorrectAnswers: true,
};

export const formatMiniAppResultsChoice = (v: MiniAppResultsChoice): string =>
  `${v.attemptLimit === null ? 'Unlimited attempts' : v.attemptLimit === 1 ? '1 attempt' : `${v.attemptLimit} attempts`}${v.showCorrectAnswers ? ', score shown' : ''}`;

/** The teacher's answer key for an app, or null when it has none. */
export async function loadMiniAppKey(
  uid: string,
  appId: string
): Promise<MiniAppAnswerKey | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'mini_app_keys', appId));
    return snap.exists() ? (snap.data() as MiniAppAnswerKey) : null;
  } catch (err) {
    logError('miniAppResults.loadKey', err, { appId });
    return null;
  }
}

export type MiniAppSubmitKind = 'result' | 'legacy' | 'done';

export interface MiniAppSubmitResponse {
  attempt: number;
  attemptsLeft: number | null;
  score?: number;
  maxScore?: number;
  items?: { id: string; correct: boolean }[];
}

export async function submitMiniAppResult(
  sessionId: string,
  kind: MiniAppSubmitKind,
  payload: unknown
): Promise<MiniAppSubmitResponse> {
  const callable = httpsCallable<
    { sessionId: string; kind: MiniAppSubmitKind; payload: unknown },
    MiniAppSubmitResponse
  >(functions, 'submitMiniAppResultV1');
  const res = await callable({ sessionId, kind, payload: payload ?? null });
  return res.data;
}

/** Maps a callable failure to the code the frame helper rejects with. */
export function submitErrorCode(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String(err.code)
      : '';
  if (code.endsWith('resource-exhausted')) return 'attempts-exhausted';
  if (code.endsWith('invalid-argument')) return 'invalid-result';
  if (code.endsWith('failed-precondition')) return 'closed';
  if (code.endsWith('permission-denied')) return 'not-allowed';
  return 'failed';
}

const receiptRebuilds = new Map<
  string,
  Promise<Record<string, unknown> | null>
>();

/** One server rebuild per submission per page, so a failed read never loops the callable. */
function rebuildReceipt(
  sessionId: string,
  docId: string
): Promise<Record<string, unknown> | null> {
  const key = `${sessionId}/${docId}`;
  const cached = receiptRebuilds.get(key);
  if (cached) return cached;
  const call = httpsCallable<
    { sessionId: string },
    { receipt: Record<string, unknown> | null }
  >(functions, 'ensureMiniAppReceiptV1');
  const promise = call({ sessionId }).then((res) => res.data.receipt ?? null);
  receiptRebuilds.set(key, promise);
  return promise;
}

/** Test hook: forget earlier rebuilds. */
export function resetReceiptRebuilds(): void {
  receiptRebuilds.clear();
}

/** A student's own submission summary, or their receipt when the summary is teacher-only; null when neither exists. */
export async function readOwnMiniAppSubmission(
  sessionId: string,
  docId: string,
  /** The session, when the caller already has it; saves a read. */
  knownSession?: { resultsVersion?: unknown; showCorrectAnswers?: unknown }
): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getDoc(
      doc(db, 'mini_app_sessions', sessionId, 'submissions', docId)
    );
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    const receipt = await getDoc(
      doc(db, 'mini_app_sessions', sessionId, 'receipts', docId)
    ).catch(() => null);
    if (receipt?.exists()) return receipt.data();
    const session =
      knownSession ??
      (await getDoc(doc(db, 'mini_app_sessions', sessionId))
        .then((s) => s.data())
        .catch(() => undefined));
    // Only a hidden-answers session refuses the summary on purpose; anything else keeps today's error.
    if (session?.resultsVersion !== 2 || session.showCorrectAnswers !== false)
      throw err;
    // Submitted before receipts existed: the server writes one from the summary.
    return rebuildReceipt(sessionId, docId);
  }
}

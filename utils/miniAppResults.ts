// Client side of Mini App results v2 (docs/plans/MINI_APP_RESULTS.md).
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

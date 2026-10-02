import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import {
  KIND_CONFIG,
  type AssignmentSummary,
} from '@/hooks/useStudentAssignments';

/**
 * Where a student's own response/submission doc lives per kind.
 *   - 'auth-uid': doc id is the pseudonym uid (quiz, VA, GL, flashcards).
 *   - 'assignment-pseudonym': HMAC(uid, assignmentId) from `getAssignmentPseudonymV1` (mini-app).
 *   - 'none': no per-student doc (activity wall posts are random ids; projects keep group docs).
 */
export type DocIdStrategy = 'auth-uid' | 'assignment-pseudonym' | 'none';

export const DOC_ID_STRATEGY: Record<AssignmentSummary['kind'], DocIdStrategy> =
  {
    quiz: 'auth-uid',
    'video-activity': 'auth-uid',
    'guided-learning': 'auth-uid',
    'mini-app': 'assignment-pseudonym',
    'activity-wall': 'none',
    flashcards: 'auth-uid',
    projects: 'none',
  };

export const RESPONSE_SUBCOLLECTION: Record<
  AssignmentSummary['kind'],
  string | null
> = {
  quiz: 'responses',
  'video-activity': 'responses',
  'guided-learning': 'responses',
  'mini-app': 'submissions',
  'activity-wall': 'submissions',
  flashcards: 'progress',
  projects: null,
};

/** Kinds whose response doc can carry a per-student `resultsOverride`. */
export const OVERRIDE_KINDS: ReadonlySet<AssignmentSummary['kind']> = new Set([
  'quiz',
  'video-activity',
  'guided-learning',
]);

let pseudonymCacheOwnerUid: string | null = null;
let pseudonymCache: Map<string, Promise<string>> = new Map();

/** Per-(uid, sessionId) pseudonym, de-duplicated across rows for the page's lifetime. */
export function getCachedPseudonym(
  sessionId: string,
  pseudonymUid: string
): Promise<string> {
  if (pseudonymCacheOwnerUid !== pseudonymUid) {
    pseudonymCache = new Map();
    pseudonymCacheOwnerUid = pseudonymUid;
  }
  const cached = pseudonymCache.get(sessionId);
  if (cached) return cached;

  const callable = httpsCallable<
    { assignmentId: string },
    { pseudonym?: string }
  >(functions, 'getAssignmentPseudonymV1');

  const promise = callable({ assignmentId: sessionId }).then((res) => {
    const p = res.data?.pseudonym;
    if (typeof p !== 'string' || p.length === 0) {
      throw new Error('Pseudonym missing from callable response.');
    }
    return p;
  });

  pseudonymCache.set(sessionId, promise);
  promise.catch(() => {
    if (pseudonymCache.get(sessionId) === promise) {
      pseudonymCache.delete(sessionId);
    }
  });
  return promise;
}

/** True when this kind has a per-student doc worth reading. */
export function hasResponseDoc(kind: AssignmentSummary['kind']): boolean {
  return (
    RESPONSE_SUBCOLLECTION[kind] !== null && DOC_ID_STRATEGY[kind] !== 'none'
  );
}

/** The student's own response doc data, or null when there is none. */
export async function readStudentResponseDoc(
  assignment: Pick<AssignmentSummary, 'kind' | 'sessionId'>,
  pseudonymUid: string
): Promise<Record<string, unknown> | null> {
  const sub = RESPONSE_SUBCOLLECTION[assignment.kind];
  const strategy = DOC_ID_STRATEGY[assignment.kind];
  if (!sub || strategy === 'none') return null;
  const docId =
    strategy === 'assignment-pseudonym'
      ? await getCachedPseudonym(assignment.sessionId, pseudonymUid)
      : pseudonymUid;
  const snap = await getDoc(
    doc(
      db,
      KIND_CONFIG[assignment.kind].collectionName,
      assignment.sessionId,
      sub,
      docId
    )
  );
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

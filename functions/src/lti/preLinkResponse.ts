// Schoology LTI 1.3 — keep a student who launched before their section was linked on the response they already started.
// Both candidate uids derive from this student's own signed launch; any failure keeps the bridged uid.

import type * as admin from 'firebase-admin';

import {
  resolveLtiTargetSession,
  QUIZ_SESSIONS_COLLECTION,
  VIDEO_ACTIVITY_SESSIONS_COLLECTION,
} from './nrpsStore';
import type { LtiTargetSessionArgs } from './nrpsStore';

export interface LaunchUidChoice {
  subUid: string;
  bridgedUid: string;
  target: LtiTargetSessionArgs | null;
}

/** The uid this launch should use so the student resumes their existing response. */
export async function chooseLaunchUid(
  db: admin.firestore.Firestore,
  { subUid, bridgedUid, target }: LaunchUidChoice
): Promise<string> {
  if (!target || bridgedUid === subUid) return bridgedUid;
  try {
    const session = await resolveLtiTargetSession(db, target);
    if (!session) return bridgedUid;
    const responses = db
      .collection(
        target.kind === 'va'
          ? VIDEO_ACTIVITY_SESSIONS_COLLECTION
          : QUIZ_SESSIONS_COLLECTION
      )
      .doc(session.sessionId)
      .collection('responses');
    const [bridgedSnap, subSnap] = await Promise.all([
      responses.doc(bridgedUid).get(),
      responses.doc(subUid).get(),
    ]);
    // A response already under the bridged uid wins: the student has moved over.
    if (bridgedSnap.exists) return bridgedUid;
    return subSnap.exists ? subUid : bridgedUid;
  } catch (err) {
    console.warn('[ltiPreLinkResponse] lookup failed; using bridged uid:', err);
    return bridgedUid;
  }
}

// Schoology LTI 1.3 — launch-time ClassLink identity bridge.
//
// A Schoology student launch mints a uid namespaced off the LTI `sub`
// (identity.ts). Everything M17 writes for a student — the per-student pointer
// doc at `student_assignments/{uid}/items/{assignmentId}` carrying targeting and
// overrides — is keyed by the ClassLink pseudonym HMAC("sid:"+sourcedId)
// instead. Those two namespaces never meet, so overrides silently missed every
// Schoology-launched student.
//
// This bridges them, mirroring the proven Google Classroom implementation
// (classroomAddonAuth.ts): if the section is linked to a ClassLink class and the
// launch email matches a OneRoster roster entry, the student launches under
// their ClassLink uid and their pointer doc is theirs to read.
//
// STICKINESS. The live match depends on a network fetch and on the section link
// still existing. A blip would otherwise re-identify a student MID-ASSIGNMENT —
// they'd resume under the sub-derived uid against an empty response doc. So a
// successful bridge records `lti_identity_bridge/{subUid} -> {classlinkUid}`,
// and a later launch that can't resolve live falls back to that stored uid. Both
// sides of the mapping are HMAC pseudonyms, so nothing here puts PII at rest.
//
// A bridge failure must NEVER block a student from taking the assignment: every
// path degrades to `null` and the caller keeps its current sub-derived uid.

import type * as admin from 'firebase-admin';

import { computeStudentUid } from '../classlinkShared';
// Reuse the existing OneRoster seam (and its test-spy point) rather than
// re-implementing the signed fetch.
import { classroomAddonNet } from '../classroomAddonAuth';

/** Sticky sub-uid → ClassLink-uid mapping. Server-write-only (firestore.rules). */
export const LTI_IDENTITY_BRIDGE_COLLECTION = 'lti_identity_bridge';

/** Firestore collection holding the Schoology section↔class link docs. */
const LTI_COURSE_LINKS_COLLECTION = 'lti_course_links';

// Firestore-id shape, matching courseLinkEndpoints.ts. The contextId is
// platform-supplied and flows into a `.doc()` path, so a slash-bearing value
// must not be able to escape its collection (path-segment injection).
const ID_RE = /^[A-Za-z0-9:_.-]{1,256}$/;

export interface ClasslinkCredentials {
  tenantUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface BridgeInput {
  /** The launch's Schoology section id; null on a privacy-stripped relaunch. */
  contextId: string | null;
  /** Platform-asserted email from the signed launch JWT. */
  email: string | null;
  /** The sub-derived uid this student would otherwise launch under. */
  subUid: string;
  hmacSecret: string;
  classlink: ClasslinkCredentials;
}

export interface BridgedIdentity {
  /** HMAC("sid:"+sourcedId) — the same uid the student's ClassLink SSO mints. */
  uid: string;
  classlinkClassId: string;
  /** True when resolved live from OneRoster; false when restored from the sticky doc. */
  live: boolean;
}

interface StickyBridgeDoc {
  classlinkUid?: unknown;
  classlinkClassId?: unknown;
}

/** Read the stored mapping for a sub-derived uid, or null if there isn't one. */
async function readSticky(
  db: admin.firestore.Firestore,
  subUid: string
): Promise<BridgedIdentity | null> {
  const snap = await db
    .doc(`${LTI_IDENTITY_BRIDGE_COLLECTION}/${subUid}`)
    .get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as StickyBridgeDoc;
  if (typeof d.classlinkUid !== 'string' || !d.classlinkUid) return null;
  const classlinkClassId =
    typeof d.classlinkClassId === 'string' ? d.classlinkClassId : '';
  if (!classlinkClassId) return null;
  return { uid: d.classlinkUid, classlinkClassId, live: false };
}

/**
 * Resolve a Schoology launch to its ClassLink identity, or null when no bridge
 * applies (unlinked section, no email released, ClassLink not configured, or the
 * student isn't in the OneRoster roster and has never bridged before).
 */
export async function resolveClasslinkIdentity(
  db: admin.firestore.Firestore,
  input: BridgeInput
): Promise<BridgedIdentity | null> {
  const { contextId, email, subUid, hmacSecret, classlink } = input;
  try {
    const live = await resolveLive(db, contextId, email, hmacSecret, classlink);
    if (live) {
      await persistSticky(db, subUid, live);
      return live;
    }
  } catch (err) {
    console.warn(
      '[ltiClasslinkBridge] live resolve failed; falling back:',
      err
    );
  }

  // Live resolve missed. If this student has bridged before, keep that identity
  // rather than silently reverting them to a different uid mid-assignment.
  try {
    return await readSticky(db, subUid);
  } catch (err) {
    console.warn('[ltiClasslinkBridge] sticky read failed:', err);
    return null;
  }
}

/** The live path: linked section + released email + OneRoster roster match. */
async function resolveLive(
  db: admin.firestore.Firestore,
  contextId: string | null,
  email: string | null,
  hmacSecret: string,
  classlink: ClasslinkCredentials
): Promise<BridgedIdentity | null> {
  if (!contextId || !ID_RE.test(contextId) || !email) return null;
  const { tenantUrl, clientId, clientSecret } = classlink;
  if (!tenantUrl || !clientId || !clientSecret) return null;

  const linkSnap = await db
    .doc(`${LTI_COURSE_LINKS_COLLECTION}/${contextId}`)
    .get();
  const classlinkClassId = (linkSnap.data() ?? {}).classlinkClassId as unknown;
  if (typeof classlinkClassId !== 'string' || !classlinkClassId) return null;

  const students = await classroomAddonNet.fetchClassStudents(
    tenantUrl,
    clientId,
    clientSecret,
    classlinkClassId
  );
  const emailLower = email.toLowerCase();
  const match = students.find(
    (s) => (s.email ?? '').toLowerCase() === emailLower
  );
  if (!match?.sourcedId) {
    console.warn(
      '[ltiClasslinkBridge] linked section but launch email not in the ' +
        'OneRoster roster; per-student overrides will not reach this student.'
    );
    return null;
  }
  return {
    uid: computeStudentUid(match.sourcedId, hmacSecret),
    classlinkClassId,
    live: true,
  };
}

/** Record the mapping so a later failed live resolve keeps this identity. */
async function persistSticky(
  db: admin.firestore.Firestore,
  subUid: string,
  bridged: BridgedIdentity
): Promise<void> {
  try {
    await db.doc(`${LTI_IDENTITY_BRIDGE_COLLECTION}/${subUid}`).set(
      {
        classlinkUid: bridged.uid,
        classlinkClassId: bridged.classlinkClassId,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    // Non-fatal: the student still launches under the correct uid this time.
    console.warn('[ltiClasslinkBridge] sticky write failed (non-fatal):', err);
  }
}

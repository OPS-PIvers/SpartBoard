// Schoology section links, one doc per teacher: the first teacher's at
// `lti_course_links/{contextId}`, each co-teacher's at `{contextId}~{uid}`.
// Every doc carries `teacherUid` and `contextId`, so per-teacher queries see both.

import { HttpsError } from 'firebase-functions/v2/https';
import type * as admin from '../firebaseAdmin';
import { deriveRole } from './jwt';
import type { NrpsMember } from './nrps';

/** Firestore collection holding the Schoology section↔class link docs. */
export const LTI_COURSE_LINKS_COLLECTION = 'lti_course_links';

/** Cap on co-teacher links read for one section. */
const MAX_SECTION_LINKS = 20;

type Db = admin.firestore.Firestore;
type DocData = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;

/** True when `email` is an active Instructor of the section. */
export function isActiveInstructor(
  members: NrpsMember[],
  email: string
): boolean {
  const lower = email.toLowerCase();
  return members.some(
    (m) =>
      (!m.status || m.status.toLowerCase() === 'active') &&
      m.email === lower &&
      deriveRole(m.roles) === 'teacher'
  );
}

/** Doc id of `uid`'s co-teacher link of `contextId`. */
export function coTeacherLinkId(contextId: string, uid: string): string {
  return `${contextId}~${uid}`;
}

/** The section a link doc points at (co-teacher doc ids carry a `~uid` suffix). */
export function linkContextId(id: string, data: DocData | undefined): string {
  return str(data?.contextId) ?? id.split('~')[0];
}

/** `uid`'s own link of `contextId`, or null; with `orSection`, the section doc when they have none. */
export async function readTeacherLink(
  db: Db,
  contextId: string,
  uid: string,
  orSection = false
): Promise<DocData | null> {
  const col = db.collection(LTI_COURSE_LINKS_COLLECTION);
  const primary = await col.doc(contextId).get();
  const primaryData = primary.exists ? (primary.data() ?? null) : null;
  if (primaryData && primaryData.teacherUid === uid) return primaryData;
  if (uid) {
    const co = await col.doc(coTeacherLinkId(contextId, uid)).get();
    if (co.exists && co.data()?.teacherUid === uid) return co.data() ?? null;
  }
  return orSection ? primaryData : null;
}

/** Co-teachers' links of `contextId` (not the section doc). */
export async function readCoTeacherLinks(
  db: Db,
  contextId: string
): Promise<DocData[]> {
  const snap = await db
    .collection(LTI_COURSE_LINKS_COLLECTION)
    .where('contextId', '==', contextId)
    .limit(MAX_SECTION_LINKS)
    .get();
  return snap.docs.filter((d) => d.id !== contextId).map((d) => d.data());
}

/** After the section doc is deleted, move a co-teacher's link into it so lookups by section keep working. */
export async function promoteCoTeacherLink(
  db: Db,
  contextId: string
): Promise<void> {
  const col = db.collection(LTI_COURSE_LINKS_COLLECTION);
  const snap = await col
    .where('contextId', '==', contextId)
    .limit(MAX_SECTION_LINKS)
    .get();
  const next = snap.docs.find((d) => d.id !== contextId);
  if (!next) return;
  await db.runTransaction(async (tx) => {
    const primaryRef = col.doc(contextId);
    const [primary, co] = await Promise.all([
      tx.get(primaryRef),
      tx.get(next.ref),
    ]);
    if (primary.exists || !co.exists) return;
    tx.set(primaryRef, co.data() ?? {});
    tx.delete(next.ref);
  });
}

export interface TeacherLinkFields {
  classlinkClassId: string | null;
  testClassId: string | null;
  classlinkOrgId: string | null;
  rosterId: string | null;
  /** The section title just read, or null to keep the stored one. */
  contextTitle: string | null;
  linkedBy?: 'url' | 'sis';
}

/**
 * Write `uid`'s link of `contextId` without touching anyone else's. When another
 * teacher holds the section doc, the caller gets a co-teacher doc, but only when
 * `coTeacher` says Schoology lists them as a teacher of the section.
 * Returns the stored title.
 */
export async function writeTeacherLink(
  db: Db,
  uid: string,
  contextId: string,
  fields: TeacherLinkFields,
  coTeacher: boolean
): Promise<string | null> {
  const col = db.collection(LTI_COURSE_LINKS_COLLECTION);
  return db.runTransaction(async (tx) => {
    const primaryRef = col.doc(contextId);
    const coRef = col.doc(coTeacherLinkId(contextId, uid));
    const [primary, co] = await Promise.all([
      tx.get(primaryRef),
      tx.get(coRef),
    ]);
    const owner = str(primary.data()?.teacherUid);
    const ownsPrimary = !primary.exists || !owner || owner === uid;
    if (!ownsPrimary && !coTeacher) {
      throw new HttpsError(
        'already-exists',
        'This Schoology section is already linked by another teacher.'
      );
    }
    const target = ownsPrimary ? primary : co;
    // Relaunches can omit the title (privacy config); keep the one captured earlier.
    const title =
      fields.contextTitle ??
      str(target.data()?.contextTitle) ??
      str(primary.data()?.contextTitle);
    const now = Date.now();
    const payload: DocData = {
      teacherUid: uid,
      contextId,
      classlinkClassId: fields.classlinkClassId,
      testClassId: fields.testClassId,
      classlinkOrgId: fields.classlinkOrgId,
      contextTitle: title,
      rosterId: fields.rosterId,
      updatedAt: now,
    };
    if (fields.linkedBy) payload.linkedBy = fields.linkedBy;
    if (!target.exists) payload.createdAt = now;
    tx.set(ownsPrimary ? primaryRef : coRef, payload, { merge: true });
    // A teacher who now holds the section doc needs no second link.
    if (ownsPrimary && co.exists) tx.delete(coRef);
    return title;
  });
}

/** Delete `uid`'s own link(s) of `contextId`; false when only another teacher's link exists. */
export async function deleteTeacherLink(
  db: Db,
  uid: string,
  contextId: string
): Promise<boolean> {
  const col = db.collection(LTI_COURSE_LINKS_COLLECTION);
  const primaryRef = col.doc(contextId);
  const coRef = col.doc(coTeacherLinkId(contextId, uid));
  const [primary, co] = await Promise.all([primaryRef.get(), coRef.get()]);
  const ownsPrimary = primary.exists && primary.data()?.teacherUid === uid;
  if (!ownsPrimary && !co.exists) return !primary.exists;
  const batch = db.batch();
  if (ownsPrimary) batch.delete(primaryRef);
  if (co.exists) batch.delete(coRef);
  await batch.commit();
  if (ownsPrimary) {
    try {
      await promoteCoTeacherLink(db, contextId);
    } catch (err) {
      console.warn('[lti] promoting a co-teacher link failed', err);
    }
  }
  return true;
}

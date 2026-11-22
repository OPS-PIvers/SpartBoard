// Moves a legacy `overridesByUid` map on a project grade into per-member override docs.
import type * as admin from './firebaseAdmin';

type Firestore = admin.firestore.Firestore;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isMemberDocId = (id: string): boolean =>
  id.length > 0 &&
  id.length <= 1500 &&
  !id.includes('/') &&
  id !== '.' &&
  id !== '..' &&
  !/^__.*__$/.test(id);

/** The legacy map wins over existing override docs, so a previous client's edit isn't shadowed; true when it moved one. */
export async function migrateLegacyProjectOverrides(
  db: Firestore,
  runId: string,
  groupId: string,
  after: Record<string, unknown> | undefined
): Promise<boolean> {
  if (!after || !('overridesByUid' in after)) return false;
  const gradeRef = db
    .collection('project_runs')
    .doc(runId)
    .collection('grades')
    .doc(groupId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(gradeRef);
    const grade = snap.data();
    if (!snap.exists || !grade || !('overridesByUid' in grade)) return false;
    const legacy = grade.overridesByUid as unknown;
    if (isRecord(legacy)) {
      for (const [uid, value] of Object.entries(legacy)) {
        if (!isMemberDocId(uid) || !isRecord(value)) continue;
        tx.set(gradeRef.collection('overrides').doc(uid), value);
      }
    }
    const rest: Record<string, unknown> = { ...grade };
    delete rest.overridesByUid;
    tx.set(gradeRef, rest);
    return true;
  });
}

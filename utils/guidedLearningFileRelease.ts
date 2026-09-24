// Reference-checked release of Guided Learning files (GUIDED_LEARNING_STUDIO.md P5-3).
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/config/firebase';
import { driveIdFromSlideUrl } from '@/components/widgets/GuidedLearning/utils/slideMedia';
import { logError } from '@/utils/logError';
import type { GuidedLearningSet } from '@/types';

export const GL_TOMBSTONES_COLLECTION = 'gl_media_tombstones';
const PERSONAL_COLLECTION = 'guided_learning';
const BUILDING_COLLECTION = 'building_guided_learning';
const ASSIGNMENTS_COLLECTION = 'guided_learning_assignments';
// Beyond this many unrecorded sets, checking them all costs too much, so nothing is released.
export const MAX_LEGACY_SET_LOADS = 20;

/** Files of a set deleted while assignments were open, held until they all close. */
export interface GuidedLearningTombstone {
  setId: string;
  storagePaths: string[];
  driveFileIds: string[];
  assignmentIds: string[];
  createdAt: number;
}

export type LoadDriveSet = (driveFileId: string) => Promise<GuidedLearningSet>;

// Every string in `value`, plus the Drive id behind each slide URL.
function collectDriveRefs(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 16 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    into.add(value);
    const id = driveIdFromSlideUrl(value);
    if (id) into.add(id);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectDriveRefs(item, into, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      collectDriveRefs(key, into, depth + 1);
      collectDriveRefs(item, into, depth + 1);
    }
  }
}

async function callerIsAdmin(): Promise<boolean> {
  const email = auth.currentUser?.email?.toLowerCase();
  if (!email) return false;
  try {
    return (await getDoc(doc(db, 'admins', email))).exists();
  } catch {
    // Unknown means the building sets get checked too.
    return true;
  }
}

export interface DriveReferenceCheck {
  uid: string;
  candidates: string[];
  /** The set whose own listing does not count (personal or building id). */
  excludeSetId?: string;
  /** The tombstone being released, whose hold does not count. */
  excludeTombstoneId?: string;
  /** Admins may have copied their Drive slides into Help Center sets. */
  isAdmin?: boolean;
  loadSet?: LoadDriveSet;
}

/** Drive ids no other set, tombstone or sub-share bundle of this teacher still uses. */
export async function unreferencedDriveIds(
  check: DriveReferenceCheck
): Promise<string[]> {
  const candidates = [...new Set(check.candidates.filter(Boolean))];
  if (candidates.length === 0) return [];
  const { uid } = check;
  const used = new Set<string>();
  const [sets, tombstones, shares] = await Promise.all([
    getDocs(collection(db, 'users', uid, PERSONAL_COLLECTION)),
    getDocs(collection(db, 'users', uid, GL_TOMBSTONES_COLLECTION)),
    getDocs(
      query(collection(db, 'shared_collections'), where('hostUid', '==', uid))
    ),
  ]);
  // Sets saved before driveFileIds was recorded have to be read from Drive.
  const legacy: string[] = [];
  for (const set of sets.docs) {
    if (set.id === check.excludeSetId) continue;
    const data = set.data();
    if (Array.isArray(data.driveFileIds)) {
      collectDriveRefs(data.driveFileIds, used);
      collectDriveRefs(data.imageUrl, used);
    } else if (typeof data.driveFileId === 'string' && data.driveFileId) {
      legacy.push(data.driveFileId);
    }
  }
  if (legacy.length > 0) {
    const { loadSet } = check;
    if (!loadSet || legacy.length > MAX_LEGACY_SET_LOADS) return [];
    const loaded = await Promise.all(legacy.map((id) => loadSet(id)));
    for (const set of loaded) collectDriveRefs(set, used);
  }
  for (const tombstone of tombstones.docs) {
    if (tombstone.id !== check.excludeTombstoneId)
      collectDriveRefs(tombstone.data(), used);
  }
  const keys = await Promise.all(
    shares.docs.map((share) =>
      getDocs(
        query(
          collection(db, 'shared_collections', share.id, 'keys'),
          where('kind', '==', 'guidedLearning')
        )
      )
    )
  );
  for (const snap of keys)
    for (const key of snap.docs) collectDriveRefs(key.data(), used);
  if (check.isAdmin ?? (await callerIsAdmin())) {
    const building = await getDocs(collection(db, BUILDING_COLLECTION));
    for (const set of building.docs) {
      if (set.id !== check.excludeSetId) collectDriveRefs(set.data(), used);
    }
  }
  return candidates.filter((id) => !used.has(id));
}

/** Deletes each Drive id nothing else uses; a failed check keeps every file. */
export async function releaseDriveFiles(
  check: DriveReferenceCheck,
  deleteDriveFile: (fileId: string) => Promise<void>
): Promise<boolean> {
  let ids: string[];
  try {
    ids = await unreferencedDriveIds(check);
  } catch (err) {
    logError('guidedLearningFileRelease.drive', err, { uid: check.uid });
    return false;
  }
  const results = await Promise.allSettled(
    ids.map((id) => deleteDriveFile(id))
  );
  return results.every((r) => r.status === 'fulfilled');
}

/** Asks the server to delete Storage files the editor removed, if nothing else uses them. */
export async function releaseStorageFiles(
  setId: string,
  building: boolean,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;
  try {
    await httpsCallable(
      functions,
      'releaseGuidedLearningMediaV1'
    )({ setId, building, paths: [...new Set(paths)] });
  } catch (err) {
    // The weekly sweep picks up anything left behind.
    logError('guidedLearningFileRelease.storage', err, { setId });
  }
}

export async function writeTombstone(
  uid: string,
  tombstone: GuidedLearningTombstone
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, GL_TOMBSTONES_COLLECTION, tombstone.setId),
    tombstone
  );
}

// Open means the assignment still exists and is not archived.
async function hasOpenAssignment(uid: string, ids: unknown): Promise<boolean> {
  if (!Array.isArray(ids) || ids.length === 0) return true;
  // A malformed id can't be checked, so it counts as open.
  if (!ids.every((id): id is string => typeof id === 'string' && id !== ''))
    return true;
  const snaps = await Promise.all(
    ids.map((id) => getDoc(doc(db, 'users', uid, ASSIGNMENTS_COLLECTION, id)))
  );
  return snaps.some((s) => s.exists() && s.data().status !== 'archived');
}

/** Releases the Drive files of every tombstone whose assignments have all closed. */
export async function releaseClosedTombstones(
  uid: string,
  deleteDriveFile: (fileId: string) => Promise<void>,
  opts: { isAdmin?: boolean; loadSet?: LoadDriveSet } = {}
): Promise<number> {
  const snap = await getDocs(
    collection(db, 'users', uid, GL_TOMBSTONES_COLLECTION)
  );
  let released = 0;
  for (const tombstone of snap.docs) {
    const data = tombstone.data() as Partial<GuidedLearningTombstone>;
    if (await hasOpenAssignment(uid, data.assignmentIds)) continue;
    const ok = await releaseDriveFiles(
      {
        uid,
        candidates: Array.isArray(data.driveFileIds) ? data.driveFileIds : [],
        excludeSetId: tombstone.id,
        excludeTombstoneId: tombstone.id,
        ...opts,
      },
      deleteDriveFile
    );
    // Storage files are the weekly sweep's once the tombstone is gone.
    if (ok) {
      await deleteDoc(tombstone.ref);
      released += 1;
    }
  }
  return released;
}

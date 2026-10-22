import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { normalizeGuidedLearningSet } from '@/components/widgets/GuidedLearning/utils/setMigration';
import { assertGuidedLearningDocFits } from '@/utils/firestoreDocSize';
import { logError } from '@/utils/logError';
import { buildTourContent, GL_TOURS_COLLECTION } from './tourSnapshot';
import { newWebTour } from './web/recordedSteps';

// Web tour storage (docs/plans/CHROME_EXTENSION.md T6): admin-only drafts, staff-only snapshots and pictures.
export const WEB_TOURS_COLLECTION = 'building_web_tours';
export const WEB_TOUR_PICTURES_PREFIX = 'web_tour_pictures';
export const WEB_TOUR_PICTURE_MAX_BYTES = 5 * 1024 * 1024;

const PICTURE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;
export type WebTourPictureType = keyof typeof PICTURE_TYPES;

const draftRef = (setId: string) => doc(db, WEB_TOURS_COLLECTION, setId);
const snapshotRef = (setId: string) => doc(db, GL_TOURS_COLLECTION, setId);

/** Firestore-safe copy of a set (no undefined values). */
const stored = (set: GuidedLearningSet): Record<string, unknown> =>
  JSON.parse(JSON.stringify(normalizeGuidedLearningSet(set))) as Record<
    string,
    unknown
  >;

/** True when a path is a picture file inside this set's own folder. */
export function isWebTourPicturePath(setId: string, path: string): boolean {
  const prefix = `${WEB_TOUR_PICTURES_PREFIX}/${setId}/`;
  return (
    setId.length > 0 &&
    !setId.includes('/') &&
    path.startsWith(prefix) &&
    path.length > prefix.length &&
    !path.slice(prefix.length).includes('/')
  );
}

/** Every picture path the set's web steps point at, limited to the set's own folder. */
export function webTourPicturePaths(
  setId: string,
  set: { steps?: unknown } | null | undefined
): Set<string> {
  const out = new Set<string>();
  if (!set || !Array.isArray(set.steps)) return out;
  for (const step of set.steps as unknown[]) {
    const web = (step as { web?: { picture?: { path?: unknown } } } | null)
      ?.web;
    const path = web?.picture?.path;
    if (typeof path === 'string' && isWebTourPicturePath(setId, path)) {
      out.add(path);
    }
  }
  return out;
}

/** Saves a web tour draft. Admins only (rules). */
export async function saveWebTourDraft(set: GuidedLearningSet): Promise<void> {
  const data = { ...stored(set), surface: 'web', updatedAt: Date.now() };
  assertGuidedLearningDocFits(`${WEB_TOURS_COLLECTION}/${set.id}`, data);
  await setDoc(draftRef(set.id), data);
}

/** Saves a blank web tour draft so the editor can open on it. */
export async function createWebTourDraft(): Promise<GuidedLearningSet> {
  const set = newWebTour();
  await saveWebTourDraft(set);
  return set;
}

/** The saved draft, or null when there is none. */
export async function loadWebTourDraft(
  setId: string
): Promise<GuidedLearningSet | null> {
  const snap = await getDoc(draftRef(setId));
  if (!snap.exists()) return null;
  return normalizeGuidedLearningSet({
    ...(snap.data() as GuidedLearningSet),
    id: setId,
  });
}

const fromDraftDoc = (
  snap: QueryDocumentSnapshot<DocumentData>
): GuidedLearningSet =>
  normalizeGuidedLearningSet({
    ...(snap.data() as GuidedLearningSet),
    id: snap.id,
  });

/** Every web tour draft, once. Admins only (rules). */
export async function listWebTourDrafts(): Promise<GuidedLearningSet[]> {
  const snap = await getDocs(collection(db, WEB_TOURS_COLLECTION));
  return snap.docs.map(fromDraftDoc);
}

/** Watches every web tour draft until the returned cleanup runs. Admins only (rules). */
export function watchWebTourDrafts(
  onChange: (sets: GuidedLearningSet[]) => void,
  onError?: (err: unknown) => void
): () => void {
  return onSnapshot(
    collection(db, WEB_TOURS_COLLECTION),
    (snap) => onChange(snap.docs.map(fromDraftDoc)),
    (err) => {
      logError('watchWebTourDrafts', err);
      onError?.(err);
    }
  );
}

/** Deletes the draft; the server then removes its snapshot and pictures. */
export async function deleteWebTourDraft(setId: string): Promise<void> {
  await deleteDoc(draftRef(setId));
}

/** Files the tour under the Help Center or back in the library, without counting as an edit. */
export async function setWebTourHelpCenter(
  setId: string,
  helpCenter: boolean
): Promise<void> {
  await updateDoc(draftRef(setId), { helpCenter });
}

/** Saves a copy of the draft under a new id, with its own copies of the pictures; never published. */
export async function duplicateWebTourDraft(
  set: GuidedLearningSet
): Promise<GuidedLearningSet> {
  const copy: GuidedLearningSet = {
    ...newWebTour(),
    title: `${set.title} (Copy)`,
    helpCenter: set.helpCenter,
  };
  const uploaded: string[] = [];
  try {
    // Every upload settles first, so a failure can't leave one finishing after the cleanup.
    const steps = await Promise.allSettled(
      set.steps.map(async (step) => {
        const picture = step.web?.picture;
        if (!step.web || !picture) return step;
        const ext = picture.path.slice(picture.path.lastIndexOf('.') + 1);
        const type = (Object.keys(PICTURE_TYPES) as WebTourPictureType[]).find(
          (k) => PICTURE_TYPES[k] === ext
        );
        // A picture outside the set's own folder can't be copied, so the copy goes without it.
        if (!type || !isWebTourPicturePath(set.id, picture.path)) {
          return { ...step, web: { ...step.web, picture: undefined } };
        }
        const bytes = await loadWebTourPicture(picture.path);
        const path = await uploadWebTourPicture(
          copy.id,
          new Blob([bytes], { type }),
          type
        );
        uploaded.push(path);
        return { ...step, web: { ...step.web, picture: { ...picture, path } } };
      })
    );
    const failed = steps.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
    copy.steps = steps.map(
      (r) => (r as PromiseFulfilledResult<GuidedLearningStep>).value
    );
    await saveWebTourDraft(copy);
  } catch (err) {
    // No draft means no delete trigger, so remove the pictures already copied.
    await Promise.allSettled(
      uploaded.map((p) => deleteObject(ref(storage, p)))
    );
    throw err;
  }
  return copy;
}

/** Uploads one step picture under a new random name and returns its Storage path (never a download URL). */
export async function uploadWebTourPicture(
  setId: string,
  bytes: Blob,
  contentType: WebTourPictureType
): Promise<string> {
  if (bytes.size > WEB_TOUR_PICTURE_MAX_BYTES) {
    throw new Error('Picture is larger than 5 MB');
  }
  const path = `${WEB_TOUR_PICTURES_PREFIX}/${setId}/${crypto.randomUUID()}.${PICTURE_TYPES[contentType]}`;
  if (!isWebTourPicturePath(setId, path)) {
    throw new Error('Invalid set id');
  }
  await uploadBytes(ref(storage, path), bytes, { contentType });
  return path;
}

/** Reads a step picture through the SDK, so district staff rules apply. */
export async function loadWebTourPicture(path: string): Promise<ArrayBuffer> {
  return getBytes(ref(storage, path), WEB_TOUR_PICTURE_MAX_BYTES);
}

/** Publishes the saved draft as the staff-only snapshot, then deletes pictures only the previous one used. */
export async function publishWebTour(
  setId: string,
  uid: string,
  check?: (draft: GuidedLearningSet) => void
): Promise<void> {
  const draft = await loadWebTourDraft(setId);
  if (!draft) throw new Error('Web tour draft not found');
  // The caller's publish gate runs on the exact draft being published; a throw aborts.
  check?.(draft);
  const previous = await getDoc(snapshotRef(setId));
  if (previous.exists() && previous.get('surface') !== 'web') {
    throw new Error('A SpartBoard tour already uses this id');
  }
  const data = {
    set: { ...buildTourContent(draft), surface: 'web' },
    surface: 'web',
    publishedAt: Date.now(),
    publishedBy: uid,
  };
  assertGuidedLearningDocFits(`${GL_TOURS_COLLECTION}/${setId}`, data);
  await setDoc(snapshotRef(setId), data);

  const before = webTourPicturePaths(
    setId,
    previous.exists() ? (previous.get('set') as { steps?: unknown }) : null
  );
  // Re-read the draft so a picture saved back into it since the publish started is kept.
  const latest = await loadWebTourDraft(setId);
  const keep = webTourPicturePaths(setId, draft);
  webTourPicturePaths(setId, latest).forEach((p) => keep.add(p));
  const stale = [...before].filter((p) => !keep.has(p));
  await Promise.all(
    stale.map((p) =>
      deleteObject(ref(storage, p)).catch((err: unknown) => {
        // A leftover file is harmless; the draft delete trigger clears the folder.
        logError('publishWebTour picture cleanup', err, { path: p });
      })
    )
  );
}

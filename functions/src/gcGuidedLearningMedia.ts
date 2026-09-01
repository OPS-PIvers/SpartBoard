/**
 * gcGuidedLearningMedia — delete Firebase Storage slides that no Guided
 * Learning set references any more.
 *
 * Personal sets keep their slide paths in `imagePaths` on the metadata doc
 * (`users/{uid}/guided_learning/{setId}`); building sets store the whole set
 * inline in `building_guided_learning/{setId}`. Duplicates share Storage
 * refs on purpose, so a path is only deleted once no remaining doc in either
 * collection still lists it.
 */
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import './functionsInit';

const PERSONAL_COLLECTION = 'guided_learning';
const BUILDING_COLLECTION = 'building_guided_learning';

export function readImagePaths(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const raw = (data as { imagePaths?: unknown }).imagePaths;
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter((p): p is string => typeof p === 'string' && p.length > 0)
    ),
  ];
}

async function isStillReferenced(
  db: admin.firestore.Firestore,
  path: string
): Promise<boolean> {
  const [personal, building] = await Promise.all([
    db
      .collectionGroup(PERSONAL_COLLECTION)
      .where('imagePaths', 'array-contains', path)
      .limit(1)
      .get(),
    db
      .collection(BUILDING_COLLECTION)
      .where('imagePaths', 'array-contains', path)
      .limit(1)
      .get(),
  ]);
  return !personal.empty || !building.empty;
}

// Returns the paths that were deleted.
export async function gcOrphanedSlidePaths(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const deleted: string[] = [];
  for (const path of paths) {
    try {
      if (await isStillReferenced(db, path)) continue;
      await bucket.file(path).delete({ ignoreNotFound: true });
      deleted.push(path);
    } catch (err) {
      logger.warn('[gcGuidedLearningMedia] failed to gc slide', { path, err });
    }
  }
  return deleted;
}

export const gcGuidedLearningMedia = onDocumentDeleted(
  `users/{uid}/${PERSONAL_COLLECTION}/{setId}`,
  async (event) => {
    const deleted = await gcOrphanedSlidePaths(
      readImagePaths(event.data?.data())
    );
    if (deleted.length > 0) {
      logger.info('[gcGuidedLearningMedia] deleted orphaned slides', {
        setId: event.params.setId,
        count: deleted.length,
      });
    }
  }
);

export const gcBuildingGuidedLearningMedia = onDocumentDeleted(
  `${BUILDING_COLLECTION}/{setId}`,
  async (event) => {
    const deleted = await gcOrphanedSlidePaths(
      readImagePaths(event.data?.data())
    );
    if (deleted.length > 0) {
      logger.info('[gcGuidedLearningMedia] deleted orphaned building slides', {
        setId: event.params.setId,
        count: deleted.length,
      });
    }
  }
);

// Web tour drafts (docs/plans/CHROME_EXTENSION.md T6): a deleted draft takes its snapshot and pictures with it.
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { GL_TOURS_COLLECTION } from './glTours';
import './functionsInit';

export const WEB_TOURS_COLLECTION = 'building_web_tours';
export const WEB_TOUR_PICTURES_PREFIX = 'web_tour_pictures';

export interface WebTourCleanupDeps {
  db: admin.firestore.Firestore;
  deletePrefix: (prefix: string) => Promise<void>;
}

/** Deletes the set's published web snapshot (never a SpartBoard one) and its picture folder, unless the draft was re-created. */
export async function cleanUpDeletedWebTour(
  setId: string,
  deps: WebTourCleanupDeps
): Promise<void> {
  const draft = await deps.db.collection(WEB_TOURS_COLLECTION).doc(setId).get();
  if (draft.exists) return;
  const snapRef = deps.db.collection(GL_TOURS_COLLECTION).doc(setId);
  const snap = await snapRef.get();
  if (snap.exists && snap.get('surface') === 'web') await snapRef.delete();
  await deps.deletePrefix(`${WEB_TOUR_PICTURES_PREFIX}/${setId}/`);
}

export const webTourCleanup = onDocumentDeleted(
  { document: `${WEB_TOURS_COLLECTION}/{setId}`, maxInstances: 10 },
  async (event) => {
    const { setId } = event.params;
    const bucket = admin.storage().bucket();
    await cleanUpDeletedWebTour(setId, {
      db: admin.firestore(),
      deletePrefix: (prefix) => bucket.deleteFiles({ prefix, force: true }),
    });
    logger.info('[webTours] cleaned up deleted draft', { setId });
  }
);

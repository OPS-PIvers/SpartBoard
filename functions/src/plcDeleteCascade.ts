// Deleting a PLC root removes everything under it, so no member doc or meeting audio outlives the group.
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import './functionsInit';

// Mirror MEETING_AUDIO_ROOT (plcRecordingCore) and NORMING_MEDIA_ROOT (plcNorming) without loading them.

export interface CascadeDeps {
  /** Subcollection refs under the deleted root. */
  listSubcollections: (plcId: string) => Promise<{ id: string }[]>;
  deleteSubcollection: (plcId: string, name: string) => Promise<void>;
  deleteStoragePrefix: (prefix: string) => Promise<void>;
}

/** Deletes every subcollection of plcs/{plcId} and its Storage prefixes; never the root doc itself. */
export async function cascadePlcDelete(
  deps: CascadeDeps,
  plcId: string
): Promise<string[]> {
  const subs = await deps.listSubcollections(plcId);
  for (const sub of subs) await deps.deleteSubcollection(plcId, sub.id);
  const prefixes = [
    `plc_meeting_audio/${plcId}/`,
    `plc_norming_media/${plcId}/`,
  ];
  for (const prefix of prefixes) await deps.deleteStoragePrefix(prefix);
  return subs.map((s) => s.id);
}

function defaultCascadeDeps(): CascadeDeps {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  return {
    listSubcollections: (plcId) =>
      db.collection('plcs').doc(plcId).listCollections(),
    deleteSubcollection: (plcId, name) =>
      db.recursiveDelete(db.collection('plcs').doc(plcId).collection(name)),
    deleteStoragePrefix: async (prefix) => {
      await bucket.deleteFiles({ prefix, force: true });
    },
  };
}

export const cascadePlcDeleteV1 = onDocumentDeleted(
  {
    document: 'plcs/{plcId}',
    memory: '512MiB',
    timeoutSeconds: 540,
    maxInstances: 5,
    retry: true,
  },
  async (event) => {
    const { plcId } = event.params;
    // Its creator re-made the group before this ran: leave the new group's data alone.
    const again = await admin.firestore().collection('plcs').doc(plcId).get();
    if (again.exists) return;
    const removed = await cascadePlcDelete(defaultCascadeDeps(), plcId);
    logger.info('cascadePlcDeleteV1 cleared a deleted PLC', { plcId, removed });
  }
);

// Server-side markers that keep a leaver's PLC headers joinable after they stop syncing.

import type * as admin from './firebaseAdmin';
import {
  PLC_DETACHED_SUBCOLLECTION,
  PLC_HEADER_COLLECTIONS,
  type PlcHeaderGroupKind,
  plcHeaderMarkerId,
} from './plcSyncJoinGuards';

export interface LeaverPlcHeader {
  plcId: string;
  headerCollection: string;
  headerId: string;
}

/** Reads the leaver's own PLC headers pointing at the group; call before any transaction write. */
export async function findLeaverPlcHeaders(
  db: admin.firestore.Firestore,
  tx: admin.firestore.Transaction,
  kind: PlcHeaderGroupKind,
  uid: string,
  groupId: string
): Promise<LeaverPlcHeader[]> {
  const found: LeaverPlcHeader[] = [];
  for (const headerCollection of PLC_HEADER_COLLECTIONS[kind]) {
    const snap = await tx.get(
      db
        .collectionGroup(headerCollection)
        .where('sharedBy', '==', uid)
        .where('syncGroupId', '==', groupId)
    );
    for (const doc of snap.docs) {
      const plcRef = doc.ref.parent.parent;
      if (!plcRef || plcRef.parent.id !== 'plcs') continue;
      found.push({ plcId: plcRef.id, headerCollection, headerId: doc.id });
    }
  }
  return found;
}

/** Marks each header; only call after this transaction confirmed `uid` was a participant. */
export function writeLeaverHeaderMarkers(
  tx: admin.firestore.Transaction,
  groupRef: admin.firestore.DocumentReference,
  uid: string,
  headers: LeaverPlcHeader[],
  now: number
): void {
  for (const h of headers) {
    tx.set(
      groupRef
        .collection(PLC_DETACHED_SUBCOLLECTION)
        .doc(plcHeaderMarkerId(h.plcId, h.headerCollection, h.headerId)),
      {
        plcId: h.plcId,
        plcContentId: h.headerId,
        headerCollection: h.headerCollection,
        sharedBy: uid,
        detachedAt: now,
      }
    );
  }
}

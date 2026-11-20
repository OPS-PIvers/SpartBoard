// Server-side markers that keep a leaver's PLC headers joinable after they stop syncing.

import * as logger from 'firebase-functions/logger';
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

/** Finds the leaver's own PLC headers for the group outside the transaction; a failed query (e.g. index building) yields none. */
export async function findLeaverPlcHeaders(
  db: admin.firestore.Firestore,
  kind: PlcHeaderGroupKind,
  uid: string,
  groupId: string
): Promise<LeaverPlcHeader[]> {
  const found: LeaverPlcHeader[] = [];
  try {
    for (const headerCollection of PLC_HEADER_COLLECTIONS[kind]) {
      const snap = await db
        .collectionGroup(headerCollection)
        .where('sharedBy', '==', uid)
        .where('syncGroupId', '==', groupId)
        .get();
      for (const doc of snap.docs) {
        const plcRef = doc.ref.parent.parent;
        if (
          !plcRef ||
          plcRef.parent.id !== 'plcs' ||
          plcRef.parent.parent !== null
        ) {
          continue;
        }
        found.push({ plcId: plcRef.id, headerCollection, headerId: doc.id });
      }
    }
  } catch (err) {
    logger.warn('PLC header lookup failed; leaving without detach markers', {
      kind,
      groupId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
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

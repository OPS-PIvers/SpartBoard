// Test double for utils/plcContentWrites: routes each write through the (mocked) firestore setDoc/updateDoc/deleteDoc.
// Hook suites keep asserting the exact path and payload they did before the writes moved to plcContentWriteV1.
import * as fs from 'firebase/firestore';
import { db } from '@/config/firebase';

export const PLC_SERVER_TIME = Object.freeze({ __plcSentinel: 'serverTime' });
export const PLC_DELETE_FIELD = Object.freeze({ __plcSentinel: 'deleteField' });

function toFirestore(data: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === PLC_SERVER_TIME && typeof fs.serverTimestamp === 'function')
      out[k] = fs.serverTimestamp();
    else if (v === PLC_DELETE_FIELD && typeof fs.deleteField === 'function')
      out[k] = fs.deleteField();
    else out[k] = v;
  }
  return out;
}

const ref = (plcId: string, coll: string, id: string) =>
  fs.doc(db, 'plcs', plcId, coll, id);

export const setPlcContentDoc = (
  plcId: string,
  coll: string,
  id: string,
  data: object
) => fs.setDoc(ref(plcId, coll, id), toFirestore(data));

export const updatePlcContentDoc = (
  plcId: string,
  coll: string,
  id: string,
  data: object
) => fs.updateDoc(ref(plcId, coll, id), toFirestore(data));

export const deletePlcContentDoc = (plcId: string, coll: string, id: string) =>
  fs.deleteDoc(ref(plcId, coll, id));

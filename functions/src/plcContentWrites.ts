// Shared PLC content writes (library headers, assignments, docs, results) run here so firestore.rules can drop them.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import * as admin from './firebaseAdmin';
import { isLiveCaller } from './authz';
import { assertViewAsAllowed } from './viewAsGuard';
import {
  isPlcContentCollection,
  plcContentWriteAllowed,
  resolveWrite,
  sentinelOf,
  type ContentWriteDeps,
  type Data,
  type PlcContentWrite,
} from './plcContentRules';

if (!admin.apps.length) {
  admin.initializeApp();
}

export interface PlcContentWriteRequest {
  plcId: string;
  writes: PlcContentWrite[];
}

export const MAX_WRITES = 100;
const DOC_ID = /^[^/]{1,700}$/;

function bad(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function denied(): never {
  // Same text Firestore shows when the rules refuse a write.
  throw new HttpsError(
    'permission-denied',
    'Missing or insufficient permissions.',
    {
      reason: 'notAllowed',
    }
  );
}

const validId = (v: unknown): v is string =>
  typeof v === 'string' && DOC_ID.test(v) && v !== '.' && v !== '..';

export function parsePlcContentWriteRequest(
  raw: unknown
): PlcContentWriteRequest {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Data;
  if (!validId(r.plcId)) bad('plcId is required.');
  if (
    !Array.isArray(r.writes) ||
    r.writes.length === 0 ||
    r.writes.length > MAX_WRITES
  )
    bad(`writes must hold 1 to ${MAX_WRITES} entries.`);
  const seen = new Set<string>();
  const writes = r.writes.map((w): PlcContentWrite => {
    const x = (w && typeof w === 'object' ? w : {}) as Data;
    if (x.op !== 'set' && x.op !== 'update' && x.op !== 'delete')
      bad('Unknown op.');
    if (!isPlcContentCollection(x.coll)) bad('Unknown collection.');
    if (!validId(x.id)) bad('id is required.');
    const key = `${x.coll}/${x.id}`;
    if (seen.has(key)) bad('Each doc may be written once per call.');
    seen.add(key);
    if (x.op === 'delete') return { op: 'delete', coll: x.coll, id: x.id };
    const data = x.data;
    if (!data || typeof data !== 'object' || Array.isArray(data))
      bad('data is required.');
    for (const [k, v] of Object.entries(data as Data)) {
      // Field paths would write nested keys the rules never saw.
      if (k === '' || k.includes('.') || k.startsWith('__'))
        bad('Bad field name.');
      if (sentinelOf(v) === 'deleteField' && x.op !== 'update')
        bad('deleteField works only in an update.');
    }
    return { op: x.op, coll: x.coll, id: x.id, data: data as Data };
  });
  return { plcId: r.plcId, writes };
}

export interface ContentCaller {
  uid: string;
}

const realDeps: ContentWriteDeps = {
  serverTime: () => admin.firestore.FieldValue.serverTimestamp(),
  deleteField: () => admin.firestore.FieldValue.delete(),
  now: () => Timestamp.now(),
};

/** Applies a batch of PLC content writes in one transaction, each checked as firestore.rules checks it. */
export async function runPlcContentWrites(
  db: admin.firestore.Firestore,
  caller: ContentCaller,
  req: PlcContentWriteRequest,
  deps: ContentWriteDeps = realDeps
): Promise<{ written: number }> {
  return db.runTransaction(async (tx) => {
    const plcRef = db.doc(`plcs/${req.plcId}`);
    const refs = req.writes.map((w) => plcRef.collection(w.coll).doc(w.id));
    const [plcSnap, ...snaps] = await Promise.all([
      tx.get(plcRef),
      ...refs.map((ref) => tx.get(ref)),
    ]);
    const plc = plcSnap.exists ? (plcSnap.data() ?? {}) : null;
    const planned = req.writes.map((w, i) => {
      const snap = snaps[i];
      const existing = snap.exists ? (snap.data() ?? {}) : null;
      if (w.op === 'update' && !existing)
        throw new HttpsError('not-found', 'No document to update.');
      const method =
        w.op === 'delete' ? 'delete' : existing ? 'update' : 'create';
      const { incoming, payload } =
        w.op === 'delete'
          ? { incoming: {}, payload: {} }
          : resolveWrite(w, existing, deps);
      const allowed = plcContentWriteAllowed({
        method,
        coll: w.coll,
        docId: w.id,
        uid: caller.uid,
        plc,
        incoming,
        existing,
      });
      if (!allowed) denied();
      return { w, ref: refs[i], payload };
    });
    for (const { w, ref, payload } of planned) {
      if (w.op === 'delete') tx.delete(ref);
      else if (w.op === 'update') tx.update(ref, payload);
      else tx.set(ref, payload);
    }
    return { written: planned.length };
  });
}

export const plcContentWriteV1 = onCall(
  { memory: '256MiB', timeoutSeconds: 60, maxInstances: 20 },
  async (request): Promise<{ written: number }> => {
    await assertViewAsAllowed(request);
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in first.');
    const token = request.auth.token as unknown as Data;
    // authUid() gives a PIN token no uid outside its session collections.
    if (token.pinLogin === true) denied();
    const req = parsePlcContentWriteRequest(request.data);
    const db = admin.firestore();
    // notDeactivated(), which every plcMember/plcCanEditContent check carries.
    if (!(await isLiveCaller(db, token))) denied();
    return runPlcContentWrites(db, { uid: request.auth.uid }, req);
  }
);

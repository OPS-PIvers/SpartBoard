// Client side of plcNotesWriteV1: PLC meeting, note, recording, note-doc and comment writes run on the server.
import {
  doc,
  getDoc,
  serverTimestamp,
  type FieldValue,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';

export type PlcNotesCollection =
  'notes' | 'meetings' | 'recordings' | 'noteDocs' | 'comments';

export interface PlcNotesWrite {
  coll: PlcNotesCollection;
  id: string;
  op: 'create' | 'update';
  /** Field values; serverTimestamp() is allowed at the top level. */
  fields: Record<string, unknown>;
  /** Precondition: each stored field (number, or timestamp millis, null when absent) must still match. */
  expect?: Record<string, number | null>;
}

interface WireWrite {
  coll: PlcNotesCollection;
  id: string;
  op: 'create' | 'update';
  data: Record<string, unknown>;
  serverTime: string[];
  expect?: Record<string, number | null>;
}

const hasMethod = (v: unknown, name: string): boolean =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as Record<string, unknown>)[name] === 'function';

/** A Firestore Timestamp (duck-typed, so test mocks of firebase/firestore still load). */
const isTimestamp = (v: unknown): v is { toMillis: () => number } =>
  hasMethod(v, 'toMillis');

const isFieldValue = (v: unknown): v is FieldValue =>
  hasMethod(v, 'isEqual') && !isTimestamp(v);

function toWire(w: PlcNotesWrite): WireWrite {
  const data: Record<string, unknown> = {};
  const serverTime: string[] = [];
  for (const [k, v] of Object.entries(w.fields)) {
    if (v === undefined) continue;
    if (isFieldValue(v)) {
      if (!v.isEqual(serverTimestamp()))
        throw new Error(`plcNotesWrite: unsupported field value in ${k}`);
      serverTime.push(k);
    } else if (isTimestamp(v)) {
      throw new Error(
        `plcNotesWrite: Timestamp values are not supported (${k})`
      );
    } else {
      data[k] = v;
    }
  }
  return {
    coll: w.coll,
    id: w.id,
    op: w.op,
    data,
    serverTime,
    ...(w.expect ? { expect: w.expect } : {}),
  };
}

/** An error from plcNotesWriteV1, with the Firestore-style code (`permission-denied`, `aborted`...). */
export class PlcNotesWriteError extends Error {
  constructor(
    readonly code: string,
    readonly reason: string | null
  ) {
    super(
      code === 'permission-denied'
        ? 'Missing or insufficient permissions.'
        : `PLC write refused: ${reason ?? code}`
    );
    this.name = 'PlcNotesWriteError';
  }
}

function normalize(err: unknown): unknown {
  const raw = (err as { code?: unknown } | null)?.code;
  if (typeof raw !== 'string') return err;
  const details = (err as { details?: unknown }).details;
  const reason =
    details && typeof details === 'object'
      ? (details as { reason?: unknown }).reason
      : undefined;
  return new PlcNotesWriteError(
    raw.replace(/^functions\//, ''),
    typeof reason === 'string' ? reason : null
  );
}

/** Runs up to five writes in one server transaction, all or nothing. */
export async function plcNotesWrite(
  plcId: string,
  writes: PlcNotesWrite[]
): Promise<void> {
  const fn = httpsCallable<
    { plcId: string; writes: WireWrite[] },
    { ok: true }
  >(functions, 'plcNotesWriteV1');
  try {
    await fn({ plcId, writes: writes.map(toWire) });
  } catch (err) {
    throw normalize(err);
  }
}

export const plcNotesCreate = (
  plcId: string,
  coll: PlcNotesCollection,
  id: string,
  fields: Record<string, unknown>
) => plcNotesWrite(plcId, [{ coll, id, op: 'create', fields }]);

export const plcNotesUpdate = (
  plcId: string,
  coll: PlcNotesCollection,
  id: string,
  fields: Record<string, unknown>
) => plcNotesWrite(plcId, [{ coll, id, op: 'update', fields }]);

/** A stored field as `expect` reads it on the server. */
export function storedMillis(value: unknown): number | null {
  // Floored: the web SDK's toMillis keeps sub-millisecond digits the server drops.
  if (typeof value === 'number') return Math.floor(value);
  if (isTimestamp(value)) return Math.floor(value.toMillis());
  return null;
}

const MUTATE_ATTEMPTS = 5;
const STAMP_FIELD: Record<'notes' | 'meetings', string> = {
  notes: 'lastEditedAt',
  meetings: 'updatedAt',
};

export type PlcNotesMutation = {
  op: 'create' | 'update';
  fields: Record<string, unknown>;
} | null;

/** Read-modify-write that retries on fresh data when a teammate's write lands first, like a transaction. */
export async function plcNotesMutate<T>(
  plcId: string,
  coll: 'notes' | 'meetings',
  id: string,
  build: (data: Record<string, unknown> | null) => {
    write: PlcNotesMutation;
    result: T;
  }
): Promise<T> {
  const ref = doc(db, 'plcs', plcId, coll, id);
  const stamp = STAMP_FIELD[coll];
  for (let attempt = 0; ; attempt += 1) {
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : null;
    const { write, result } = build(data);
    if (!write) return result;
    try {
      await plcNotesWrite(plcId, [
        {
          coll,
          id,
          op: write.op,
          fields: write.fields,
          expect: {
            version: storedMillis(data?.version),
            [stamp]: storedMillis(data?.[stamp]),
          },
        },
      ]);
      return result;
    } catch (err) {
      const retry =
        err instanceof PlcNotesWriteError &&
        (err.code === 'aborted' || err.code === 'already-exists') &&
        attempt < MUTATE_ATTEMPTS - 1;
      if (!retry) throw err;
      // Jitter so two clients retrying don't collide in lockstep.
      await new Promise((resolve) =>
        setTimeout(resolve, 60 + Math.random() * 140)
      );
    }
  }
}

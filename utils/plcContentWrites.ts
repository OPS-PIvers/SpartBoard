// Client side of plcContentWriteV1: shared PLC content writes go through the server, checked as the rules checked them.
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

export type PlcContentCollection =
  | 'assessments'
  | 'assignment_index'
  | 'assignments'
  | 'docs'
  | 'flashcard_results'
  | 'flashcard_sets'
  | 'question_banks'
  | 'quizzes'
  | 'rubrics'
  | 'video_activities';

/** Stands in for serverTimestamp() in a write sent to plcContentWriteV1. */
export const PLC_SERVER_TIME = Object.freeze({ __plcSentinel: 'serverTime' });
/** Stands in for deleteField() in an update sent to plcContentWriteV1. */
export const PLC_DELETE_FIELD = Object.freeze({ __plcSentinel: 'deleteField' });

export type PlcContentWrite =
  | {
      op: 'set' | 'update';
      coll: PlcContentCollection;
      id: string;
      data: object;
    }
  | { op: 'delete'; coll: PlcContentCollection; id: string };

interface PlcContentWriteRequest {
  plcId: string;
  writes: PlcContentWrite[];
}

const MAX_WRITES = 100;

// Firestore's own wording, so callers' existing error handling and messages stay the same.
const MESSAGES: Record<string, string> = {
  'permission-denied': 'Missing or insufficient permissions.',
  'not-found': 'No document to update.',
};

function bareCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string'
    ? code.replace(/^functions\//, '')
    : undefined;
}

/** Drops undefined values the way Firestore's ignoreUndefinedProperties does; the callable encoder would send null. */
export function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}

async function send(req: PlcContentWriteRequest): Promise<void> {
  const fn = httpsCallable<PlcContentWriteRequest, { written: number }>(
    functions,
    'plcContentWriteV1'
  );
  try {
    await fn(stripUndefined(req) as PlcContentWriteRequest);
  } catch (err) {
    const code = bareCode(err);
    const known = code ? MESSAGES[code] : undefined;
    throw Object.assign(
      new Error(known ?? (err instanceof Error ? err.message : String(err))),
      { code, cause: err }
    );
  }
}

/** Applies the writes atomically, like one writeBatch; more than 100 are sent in separate calls. */
export async function writePlcContent(
  plcId: string,
  writes: PlcContentWrite[]
): Promise<void> {
  for (let i = 0; i < writes.length; i += MAX_WRITES) {
    await send({ plcId, writes: writes.slice(i, i + MAX_WRITES) });
  }
}

/** setDoc on plcs/{plcId}/{coll}/{id}. */
export function setPlcContentDoc(
  plcId: string,
  coll: PlcContentCollection,
  id: string,
  data: object
): Promise<void> {
  return writePlcContent(plcId, [{ op: 'set', coll, id, data }]);
}

/** updateDoc on plcs/{plcId}/{coll}/{id}; rejects with code `not-found` when the doc is missing. */
export function updatePlcContentDoc(
  plcId: string,
  coll: PlcContentCollection,
  id: string,
  data: object
): Promise<void> {
  return writePlcContent(plcId, [{ op: 'update', coll, id, data }]);
}

/** deleteDoc on plcs/{plcId}/{coll}/{id}. */
export function deletePlcContentDoc(
  plcId: string,
  coll: PlcContentCollection,
  id: string
): Promise<void> {
  return writePlcContent(plcId, [{ op: 'delete', coll, id }]);
}

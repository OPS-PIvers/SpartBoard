// Keeps poll_codes/{code} pointing at the session a join code should open, so clients never write pointers.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { pointerMembers } from './pollCodeMembers';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

interface Change {
  before: { exists: boolean; data: () => Doc | undefined };
  after: { exists: boolean; data: () => Doc | undefined };
}

const CODE_RE = /^[A-Z0-9]{1,16}$/;

/** The code a session id names (`{teacherUid}_{code}`), or null. */
export function codeOfSessionId(sessionId: string): string | null {
  const at = sessionId.lastIndexOf('_');
  if (at <= 0) return null;
  const code = sessionId.slice(at + 1);
  return CODE_RE.test(code) ? code : null;
}

/** A session that a join code can still open: not retired by a rotation. */
function isJoinable(data: Doc | undefined): data is Doc {
  if (!data) return false;
  return !(
    data.active !== true &&
    Array.isArray(data.questions) &&
    data.questions.length === 0
  );
}

/** True when `mine` should take the code from `other`, mirroring the old ranked lookup. */
function outranks(mine: Doc, other: Doc | undefined): boolean {
  if (!isJoinable(other)) return true;
  if (other.active === true) return false;
  if (mine.active === true) return true;
  const n = (v: unknown) => (typeof v === 'number' ? v : 0);
  return n(mine.updatedAt) > n(other.updatedAt);
}

// Mirrors RESERVATION_TTL_MS in pollCodeResolve.ts.
const RESERVATION_TTL_MS = 15 * 60 * 1000;

/** The uid a session id belongs to: everything before `_{code}`. */
const ownerOf = (sessionId: string, code: string) =>
  sessionId.slice(0, sessionId.length - code.length - 1);

/** A colleague's session takes the code only once the server has checked they share the board (claimPollCodeV1). */
function mayHold(
  pointer: Doc | undefined,
  sessionId: string,
  code: string
): boolean {
  if (!pointer) return true;
  return pointerMembers(pointer).includes(ownerOf(sessionId, code));
}

/** A reservation whose session never appeared, which any teacher may then take, as mintPollCode does. */
function abandonedReservation(pointer: Doc | undefined, now: number): boolean {
  const at = pointer?.reservedAt ?? pointer?.updatedAt;
  return typeof at === 'number' && now - at > RESERVATION_TTL_MS;
}

function pointerFor(sessionId: string, code: string, previous?: Doc) {
  const teacherUid = ownerOf(sessionId, code);
  // Carry the checked colleagues along, so the code can move back to whoever held it before.
  const members = previous ? pointerMembers(previous) : [];
  const memberUids =
    members.includes(teacherUid) && members.length > 1 ? members : null;
  return {
    sessionId,
    teacherUid,
    updatedAt: Date.now(),
    ...(memberUids ? { memberUids } : {}),
  };
}

export async function handlePollSessionWrite(
  db: Firestore,
  sessionId: string,
  change: Change | undefined
): Promise<void> {
  if (!change) return;
  const code = codeOfSessionId(sessionId);
  if (!code) return;
  const pointerRef = db.collection('poll_codes').doc(code);
  const sessions = db.collection('poll_sessions');
  await db.runTransaction(async (tx) => {
    const pointer = await tx.get(pointerRef);
    const ptr = pointer.exists ? pointer.data() : undefined;
    // Re-read the session: the event's `after` can be stale on retried or reordered deliveries.
    const snap = await tx.get(sessions.doc(sessionId));
    const mine = snap.exists ? snap.data() : undefined;
    // The doc id, not the writer-controlled `code` field, names the code.
    if (mine && mine.code !== undefined && mine.code !== code) return;
    const current = ptr ? (ptr.sessionId as unknown) : null;
    const holds = current === sessionId;
    if (isJoinable(mine) && !holds && typeof current === 'string') {
      const other = await tx.get(sessions.doc(current));
      if (!outranks(mine, other.exists ? other.data() : undefined)) return;
      if (
        !mayHold(ptr, sessionId, code) &&
        !(!other.exists && abandonedReservation(ptr, Date.now()))
      ) {
        return;
      }
    }
    if (isJoinable(mine) && !holds) {
      tx.set(pointerRef, pointerFor(sessionId, code, ptr));
      return;
    }
    if (!holds) return;
    // The holder retired or went inactive: hand the code to the best joinable session sharing it.
    if (isJoinable(mine) && mine.active === true) return;
    const rivals = await tx.get(sessions.where('code', '==', code));
    // Seed with the holder so ties keep the pointer where it is.
    let best: { id: string; data: Doc } | null = isJoinable(mine)
      ? { id: sessionId, data: mine }
      : null;
    for (const d of rivals.docs) {
      const data = d.data();
      if (d.id === sessionId) continue;
      if (codeOfSessionId(d.id) !== code || !isJoinable(data)) continue;
      if (!mayHold(ptr, d.id, code)) continue;
      if (!best || outranks(data, best.data)) best = { id: d.id, data };
    }
    if (isJoinable(mine) && (!best || best.id === sessionId)) return;
    if (!best) tx.delete(pointerRef);
    else tx.set(pointerRef, pointerFor(best.id, code, ptr));
  });
}

export const pollCodePointer = onDocumentWritten(
  { document: 'poll_sessions/{sessionId}', memory: '256MiB', maxInstances: 10 },
  async (event) => {
    await handlePollSessionWrite(
      admin.firestore(),
      event.params.sessionId,
      event.data
    );
  }
);

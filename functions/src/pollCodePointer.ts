// Keeps poll_codes/{code} pointing at the session a join code should open, so clients never write pointers.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import './functionsInit';

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

export async function handlePollSessionWrite(
  db: Firestore,
  sessionId: string,
  change: Change | undefined
): Promise<void> {
  if (!change) return;
  const code = codeOfSessionId(sessionId);
  if (!code) return;
  const after = change.after.exists ? change.after.data() : undefined;
  // The doc id, not the writer-controlled `code` field, names the code.
  if (after && after.code !== undefined && after.code !== code) return;
  const pointerRef = db.collection('poll_codes').doc(code);
  await db.runTransaction(async (tx) => {
    const pointer = await tx.get(pointerRef);
    const current = pointer.exists
      ? (pointer.data()?.sessionId as unknown)
      : null;
    if (!isJoinable(after)) {
      if (current === sessionId) tx.delete(pointerRef);
      return;
    }
    if (current !== sessionId && typeof current === 'string') {
      const other = await tx.get(db.collection('poll_sessions').doc(current));
      if (!outranks(after, other.exists ? other.data() : undefined)) return;
    }
    if (current === sessionId) return;
    tx.set(pointerRef, {
      sessionId,
      teacherUid:
        typeof after.teacherUid === 'string'
          ? after.teacherUid
          : sessionId.slice(0, sessionId.length - code.length - 1),
      updatedAt: Date.now(),
    });
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

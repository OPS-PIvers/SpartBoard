/**
 * launchSubAssignmentV1 — a substitute starts an activity in the teacher's own
 * account (docs/plans/SUB_SHARE_COLLECTIONS.md §3.6, D7, D14).
 *
 * The substitute cannot write `users/{hostUid}/*`, and the session must carry
 * `teacherUid = host` for the teacher's Results to find it, so the write runs
 * here as admin after this file proves the caller may act.
 *
 * The caller sends the session and assignment docs its own client built, and
 * this file checks them against the answer key the share bundled: same quiz,
 * same question ids and wording, no answer-bearing field anywhere, no field
 * outside the allowlist. Ownership, identity and the monitor stamp are set
 * here and cannot be supplied. Plan §3.6 called for re-deriving the session
 * server-side instead, which the session builder's size is against: it is
 * ~400 lines of client logic over translations, read-aloud, stimuli and bank
 * slots, and `functions/` cannot import root modules (its tsconfig rootDir is
 * `src`), so re-deriving means a mirror that drifts silently. Checking the
 * payload keeps one implementation and makes the trust boundary explicit.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';

/** Only the kinds D8 puts in v1; Poll and Activity Wall stay unlaunchable. */
const LAUNCHABLE_KINDS = ['quiz'] as const;
type LaunchKind = (typeof LAUNCHABLE_KINDS)[number];

const MAX_ID_LENGTH = 128;
const MAX_CLASS_IDS = 20;
/** A session doc is capped at ~1 MiB by Firestore; stay well inside it. */
const MAX_PAYLOAD_BYTES = 700_000;

const DISTRICT_EMAIL = /^[^@]+@orono\.k12\.mn\.us$/;
/** `allocateJoinCode`'s shape, since the code becomes a document id. */
const JOIN_CODE = /^[A-Z0-9]{4,8}$/;

/**
 * Fields a substitute may not decide. `teacherUid`, the ids and the monitor
 * stamp are written here; the rest would either pool a teacher's results into
 * a PLC or move a window the teacher set.
 */
const REJECTED_SESSION_FIELDS = [
  'teacherUid',
  'id',
  'assignmentId',
  'launchedBy',
  'subMonitorUids',
  'subMonitorUntil',
  'plcId',
  'syncGroupId',
  'plcLinkedAt',
  'individualTargeting',
  'rosterIds',
] as const;

/** Any of these on a session means the answer key is riding along. */
const ANSWER_FIELDS = [
  'correctAnswer',
  'incorrectAnswers',
  'matchingDistractors',
  'acceptableVariants',
  'rubric',
];

export interface LaunchSubAssignmentInput {
  shareId: string;
  boardId: string;
  widgetId: string;
  kind: LaunchKind;
  /** The item the widget has open — the id the share bundled a key for. */
  itemId: string;
  /** The session doc the caller's client built, minus everything above. */
  session: Record<string, unknown>;
  /** The teacher-side assignment doc, same rules. */
  assignment: Record<string, unknown>;
  /** ClassLink class ids to target. Class-wide only in v1. */
  classIds: string[];
}

export interface LaunchSubAssignmentResult {
  sessionId: string;
  code: string;
}

export interface SubLaunchCaller {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  anonymous: boolean;
  studentRole: boolean;
}

function bad(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function denied(message: string): never {
  throw new HttpsError('permission-denied', message);
}

function shortId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value || value.length > MAX_ID_LENGTH) {
    bad(`${field} must be a non-empty id`);
  }
  if (value.includes('/')) bad(`${field} must not be a path`);
  return value;
}

/** Walks a payload for an answer-bearing key at any depth. */
export function findAnswerField(
  value: unknown,
  depth: number = 0
): string | null {
  if (depth > 8 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = findAnswerField(entry, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (ANSWER_FIELDS.includes(key)) return key;
    const hit = findAnswerField(entry, depth + 1);
    if (hit) return hit;
  }
  return null;
}

interface KeyQuestion {
  id: string;
  text: string;
}

/**
 * The public questions must be the key's own questions: same ids, same
 * wording, nothing added. Wording is compared because a substitute editing a
 * question would otherwise land a quiz in the teacher's results that the
 * teacher never wrote.
 */
export function publicQuestionsMatchKey(
  publicQuestions: unknown,
  keyQuestions: KeyQuestion[]
): string | null {
  if (!Array.isArray(publicQuestions) || publicQuestions.length === 0) {
    return 'the session carried no questions';
  }
  const byId = new Map(keyQuestions.map((q) => [q.id, q]));
  for (const raw of publicQuestions) {
    if (!raw || typeof raw !== 'object') return 'a question was not an object';
    const q = raw as { id?: unknown; text?: unknown };
    if (typeof q.id !== 'string') return 'a question had no id';
    const keyQuestion = byId.get(q.id);
    if (!keyQuestion) return `question ${q.id} is not in the shared quiz`;
    if (typeof q.text !== 'string' || q.text !== keyQuestion.text) {
      return `question ${q.id} does not match the shared quiz`;
    }
  }
  return null;
}

function approxBytes(value: unknown): number {
  return JSON.stringify(value ?? null).length;
}

export interface SubLaunchDeps {
  now: () => number;
  newId: () => string;
}

export const liveSubLaunchDeps: SubLaunchDeps = {
  now: () => Date.now(),
  newId: () => randomUUID(),
};

export async function handleLaunchSubAssignment(
  db: admin.firestore.Firestore,
  caller: SubLaunchCaller | null,
  data: unknown,
  deps: SubLaunchDeps = liveSubLaunchDeps
): Promise<LaunchSubAssignmentResult> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (caller.anonymous || caller.studentRole) {
    denied('This is for staff accounts.');
  }
  const email = (caller.email ?? '').toLowerCase();
  if (!caller.emailVerified || !DISTRICT_EMAIL.test(email)) {
    denied('A verified district account is required.');
  }

  const input = (data ?? {}) as Partial<LaunchSubAssignmentInput>;
  const shareId = shortId(input.shareId, 'shareId');
  const boardId = shortId(input.boardId, 'boardId');
  const widgetId = shortId(input.widgetId, 'widgetId');
  const itemId = shortId(input.itemId, 'itemId');
  const kind = input.kind as LaunchKind;
  if (!LAUNCHABLE_KINDS.includes(kind)) {
    bad('That activity cannot be started from a share yet.');
  }
  const classIds = Array.isArray(input.classIds) ? input.classIds : [];
  if (classIds.length === 0) bad('Pick at least one class.');
  if (classIds.length > MAX_CLASS_IDS) bad('Too many classes.');
  for (const id of classIds) shortId(id, 'classIds');
  const session = input.session;
  const assignment = input.assignment;
  if (!session || typeof session !== 'object') bad('session is required.');
  if (!assignment || typeof assignment !== 'object') {
    bad('assignment is required.');
  }
  if (approxBytes(session) + approxBytes(assignment) > MAX_PAYLOAD_BYTES) {
    bad('That activity is too large to start from a share.');
  }

  const settings = await db.doc('admin_settings/sub_launch_as_teacher').get();
  if (settings.data()?.enabled !== true) {
    denied('Starting an activity from a share is turned off.');
  }

  const shareSnap = await db.doc(`shared_collections/${shareId}`).get();
  const share = shareSnap.data();
  if (!shareSnap.exists || !share) denied('That share no longer exists.');
  if (share.intendedMode !== 'substitute') {
    denied('That share is not a substitute share.');
  }
  const expiresAt =
    typeof share.expiresAt === 'number' ? share.expiresAt : null;
  if (expiresAt === null || expiresAt <= deps.now()) {
    denied('That share has expired.');
  }
  const subEmails = Array.isArray(share.subEmails) ? share.subEmails : [];
  if (!subEmails.some((e: unknown) => String(e).toLowerCase() === email)) {
    denied('This share does not name you as a substitute.');
  }
  const hostUid = typeof share.hostUid === 'string' ? share.hostUid : '';
  if (!hostUid) denied('That share has no teacher.');

  const boardSnap = await db
    .doc(`shared_collections/${shareId}/boards/${boardId}`)
    .get();
  const board = boardSnap.data();
  if (!boardSnap.exists || !board) denied('That board is not in the share.');
  const widgets: unknown[] = Array.isArray(board.widgets) ? board.widgets : [];
  const onBoard = widgets.some(
    (w) =>
      !!w && typeof w === 'object' && (w as { id?: unknown }).id === widgetId
  );
  if (!onBoard) denied('That widget is not on the shared board.');

  const keySnap = await db
    .doc(`shared_collections/${shareId}/keys/${kind}_${itemId}`)
    .get();
  const keyPayload = keySnap.data()?.payload as
    | { quiz?: { id?: string; questions?: KeyQuestion[] } }
    | undefined;
  const keyQuiz = keyPayload?.quiz;
  if (!keySnap.exists || !keyQuiz) {
    denied('The teacher did not leave this activity for a substitute.');
  }
  if (keyQuiz.id !== itemId) denied('That activity does not match the share.');

  for (const field of REJECTED_SESSION_FIELDS) {
    if (field in session) bad(`${field} is not yours to set.`);
    if (field in assignment) bad(`${field} is not yours to set.`);
  }
  const answerField =
    findAnswerField(session) ?? findAnswerField(assignment.questions);
  if (answerField) bad(`${answerField} must not reach a student session.`);
  if (session.quizId !== itemId) bad('The session is for another quiz.');
  const mismatch = publicQuestionsMatchKey(
    session.publicQuestions,
    keyQuiz.questions ?? []
  );
  if (mismatch) bad(mismatch);

  // The code is the caller's client's own allocation and becomes a document
  // id, so it is shaped here before it is written. A code already in use is
  // expected: codes are recycled, and a pointer per session is the design.
  const code = typeof session.code === 'string' ? session.code : '';
  if (!JOIN_CODE.test(code)) bad('The session carried no join code.');

  const sessionId = deps.newId();
  const now = deps.now();
  const launchedBy = { uid: caller.uid, email, shareId };
  const stamp = {
    teacherUid: hostUid,
    launchedBy,
    subMonitorUids: [caller.uid],
    subMonitorUntil: expiresAt,
  };

  const batch = db.batch();
  batch.set(db.doc(`quiz_sessions/${sessionId}`), {
    ...session,
    ...stamp,
    id: sessionId,
    assignmentId: sessionId,
    classIds,
    classId: classIds[0],
  });
  batch.set(db.doc(`users/${hostUid}/quiz_assignments/${sessionId}`), {
    ...assignment,
    ...stamp,
    id: sessionId,
    classIds,
    classId: classIds[0],
    createdAt: now,
  });
  batch.set(db.doc(`quiz_join_codes/${code}/sessions/${sessionId}`), {
    sessionId,
    teacherUid: hostUid,
    createdAt: now,
  });
  await batch.commit();

  return { sessionId, code };
}

export const launchSubAssignmentV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) =>
    handleLaunchSubAssignment(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            email: request.auth.token.email ?? null,
            emailVerified: request.auth.token.email_verified === true,
            anonymous:
              request.auth.token.firebase?.sign_in_provider === 'anonymous',
            studentRole: request.auth.token.studentRole === true,
          }
        : null,
      request.data
    )
);

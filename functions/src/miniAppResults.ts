// The one write path for v2 Mini App submissions (docs/plans/MINI_APP_RESULTS.md D6, D8, D9).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { computeAssignmentPseudonym } from './assignmentPseudonym';
import {
  MAX_RESULT_BYTES,
  MiniAppResultError,
  gradeMiniAppResult,
  isRecord,
  jsonBytes,
  parseMiniAppResult,
  readAnswerKey,
  readManifest,
  stripPrivateFields,
  type GradeOutcome,
} from './miniAppGrading';
import { isPeriodFrozen } from './quizSessionContent';
import { STUDENT_PSEUDONYM_HMAC_SECRET } from './secrets';
import { staffIdentityFromToken, type StaffIdentity } from './staffAudience';
import { assertViewAsAllowed } from './viewAsGuard';

export const WINDOW_GRACE_MS = 120_000;
const SESSIONS = 'mini_app_sessions';
const MAX_ID_LENGTH = 128;
const MAX_LEGACY_KEYS = 50;

/** `result`: SpartBoard.submit; `legacy`: an old app's SPART_MINIAPP_RESULT; `done`: I'm Done. */
export type SubmitKind = 'result' | 'legacy' | 'done';

export interface SubmitMiniAppResultInput {
  sessionId: string;
  kind: SubmitKind;
  payload: unknown;
}

export interface MiniAppCaller {
  uid: string;
  studentRole: boolean;
  classIds: string[];
  /** Verified district staff identity from the token; null for students and anonymous callers. */
  staff?: StaffIdentity | null;
}

export interface SubmitMiniAppResultResponse {
  attempt: number;
  attemptsLeft: number | null;
  score?: number;
  maxScore?: number;
  items?: { id: string; correct: boolean }[];
}

const invalid = (message: string): never => {
  throw new HttpsError('invalid-argument', message);
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function parseSubmitInput(raw: unknown): SubmitMiniAppResultInput {
  const data = isRecord(raw) ? raw : {};
  const sessionId = data.sessionId;
  if (
    typeof sessionId !== 'string' ||
    sessionId.length === 0 ||
    sessionId.length > MAX_ID_LENGTH ||
    sessionId.includes('/')
  )
    invalid('sessionId is required.');
  const kind = data.kind;
  if (kind !== 'result' && kind !== 'legacy' && kind !== 'done')
    invalid('kind must be result, legacy or done.');
  return {
    sessionId: sessionId as string,
    kind: kind as SubmitKind,
    payload: data.payload,
  };
}

/** Old apps posted any JSON; wrap non-objects the way the v1 client did. */
function legacyPayload(raw: unknown): Record<string, unknown> {
  const wrapped = isRecord(raw) ? raw : { value: raw ?? null };
  if (jsonBytes(wrapped) > MAX_RESULT_BYTES)
    invalid('The result is larger than 20 KB.');
  const cleaned = stripPrivateFields(wrapped) as Record<string, unknown>;
  if (Object.keys(cleaned).length > MAX_LEGACY_KEYS)
    invalid('The result has more than 50 fields.');
  return cleaned;
}

const attemptLimitOf = (session: Record<string, unknown>): number | null =>
  isFiniteNumber(session.attemptLimit) && session.attemptLimit >= 1
    ? Math.floor(session.attemptLimit)
    : null;

const ratio = (score: number, max: number): number =>
  max > 0 ? score / max : 0;

export async function handleSubmitMiniAppResult(
  db: admin.firestore.Firestore,
  caller: MiniAppCaller | null,
  rawInput: unknown,
  nowMs: number,
  pseudonymFor: (uid: string, sessionId: string) => string
): Promise<SubmitMiniAppResultResponse> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  const input = parseSubmitInput(rawInput);
  const sessionRef = db.collection(SESSIONS).doc(input.sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists)
    throw new HttpsError('not-found', 'Assignment not found.');
  const session: Record<string, unknown> = sessionSnap.data() ?? {};

  if (session.resultsVersion !== 2)
    throw new HttpsError(
      'failed-precondition',
      'This assignment saves results directly.'
    );
  if (session.status !== 'active')
    throw new HttpsError('failed-precondition', 'This assignment has ended.');
  const staffSession = session.audience === 'staff';
  if (staffSession && !caller.staff)
    throw new HttpsError(
      'permission-denied',
      'Sign in with your district account.'
    );
  // Staff sessions name each submission from the token, as the client rule does.
  const staffFields =
    staffSession && caller.staff
      ? {
          staffEmail: caller.staff.staffEmail,
          staffName: caller.staff.staffName,
        }
      : {};
  if (session.mode === 'view-only')
    throw new HttpsError(
      'failed-precondition',
      'This assignment does not take submissions.'
    );
  if (input.kind !== 'done' && session.submissionsEnabled !== true)
    throw new HttpsError(
      'failed-precondition',
      'This assignment does not take submissions.'
    );

  const classIds = Array.isArray(session.classIds)
    ? session.classIds.filter((c): c is string => typeof c === 'string')
    : [];
  if (
    caller.studentRole &&
    classIds.length > 0 &&
    !caller.classIds.some((c) => classIds.includes(c))
  )
    throw new HttpsError('permission-denied', 'Not assigned to this student.');
  if (caller.studentRole) {
    const pointerId =
      typeof session.assignmentId === 'string'
        ? session.assignmentId
        : input.sessionId;
    const pointer = await db
      .collection('student_assignments')
      .doc(caller.uid)
      .collection('items')
      .doc(pointerId)
      .get();
    if (pointer.exists && pointer.data()?.excluded === true)
      throw new HttpsError(
        'permission-denied',
        'Not assigned to this student.'
      );
  }

  if (
    isFiniteNumber(session.closeAt) &&
    nowMs >= session.closeAt + WINDOW_GRACE_MS
  )
    throw new HttpsError('failed-precondition', 'This assignment is closed.');
  if (session.periodAccess && typeof session.periodAccess === 'object') {
    const seatSnap = await sessionRef.collection('seats').doc(caller.uid).get();
    const seat: Record<string, unknown> = seatSnap.exists
      ? (seatSnap.data() ?? {})
      : {};
    if (
      isPeriodFrozen(
        session,
        { classId: seat.classId, studentUid: caller.uid },
        nowMs
      )
    )
      throw new HttpsError(
        'failed-precondition',
        "Your class period isn't open right now."
      );
  }

  // Validation and grading run before the transaction; only the attempt count needs it.
  let payload: Record<string, unknown> = { completed: true };
  let outcome: GradeOutcome | null = null;
  if (input.kind === 'result') {
    try {
      // Grade the raw answers so an answer containing "@" still counts; only the stripped copy is saved.
      const raw = parseMiniAppResult(input.payload);
      const clean = parseMiniAppResult(stripPrivateFields(raw));
      const keySnap = await sessionRef.collection('private').doc('key').get();
      const graded = gradeMiniAppResult(
        raw,
        readManifest(session.manifest),
        readAnswerKey(keySnap.exists ? keySnap.data() : null)
      );
      const savedAnswers = new Map(clean.items.map((i) => [i.id, i.answer]));
      outcome = {
        ...graded,
        items: graded.items.map((g) => ({
          ...g,
          answer: savedAnswers.get(g.id) ?? null,
        })),
      };
      payload = {
        items: clean.items,
        ...(clean.score !== undefined ? { score: clean.score } : {}),
        ...(clean.maxScore !== undefined ? { maxScore: clean.maxScore } : {}),
        ...(clean.data !== undefined ? { data: clean.data } : {}),
      };
    } catch (err) {
      if (err instanceof MiniAppResultError) invalid(err.message);
      throw err;
    }
  } else if (input.kind === 'legacy') {
    payload = legacyPayload(input.payload);
  }

  const studentKey = caller.studentRole
    ? pseudonymFor(caller.uid, input.sessionId)
    : caller.uid;
  const summaryRef = sessionRef.collection('submissions').doc(studentKey);
  const limit = attemptLimitOf(session);

  return db.runTransaction(async (tx) => {
    const summarySnap = await tx.get(summaryRef);
    const summary: Record<string, unknown> = summarySnap.exists
      ? (summarySnap.data() ?? {})
      : {};
    if (
      !summarySnap.exists &&
      isFiniteNumber(session.openAt) &&
      nowMs < session.openAt - WINDOW_GRACE_MS
    )
      throw new HttpsError(
        'failed-precondition',
        'This assignment is not open.'
      );
    const count = isFiniteNumber(summary.attemptCount)
      ? summary.attemptCount
      : 0;
    const left = (used: number): number | null =>
      limit === null ? null : Math.max(0, limit - used);

    if (input.kind === 'done') {
      const prior = isRecord(summary.payload) ? summary.payload : {};
      tx.set(
        summaryRef,
        {
          submittedAt: nowMs,
          studentUid: caller.uid,
          ...staffFields,
          payload: { ...prior, completed: true },
        },
        { merge: true }
      );
      return { attempt: count, attemptsLeft: left(count) };
    }

    // Old apps post progress repeatedly, so a legacy post replaces the saved payload without using an attempt.
    if (input.kind === 'legacy') {
      tx.set(
        summaryRef,
        {
          submittedAt: nowMs,
          studentUid: caller.uid,
          ...staffFields,
          payload:
            isRecord(summary.payload) && summary.payload.completed === true
              ? { ...payload, completed: true }
              : payload,
          lastSubmittedAt: nowMs,
        },
        {
          mergeFields: [
            'submittedAt',
            'studentUid',
            'payload',
            'lastSubmittedAt',
            ...Object.keys(staffFields),
          ],
        }
      );
      return { attempt: count, attemptsLeft: left(count) };
    }

    if (limit !== null && count >= limit)
      throw new HttpsError('resource-exhausted', 'attempts-exhausted');
    const attemptNo = count + 1;
    const scored =
      outcome && outcome.score !== null && outcome.maxScore !== null
        ? {
            score: outcome.score,
            maxScore: outcome.maxScore,
            gradedBy: outcome.gradedBy,
          }
        : null;
    const priorBest = isRecord(summary.best) ? summary.best : null;
    const beatsBest =
      scored !== null &&
      (priorBest === null ||
        !isFiniteNumber(priorBest.score) ||
        !isFiniteNumber(priorBest.maxScore) ||
        ratio(scored.score, scored.maxScore) >
          ratio(priorBest.score, priorBest.maxScore));
    const best = beatsBest
      ? {
          ...scored,
          attemptNo,
          // Per-question marks for the results table's columns (D10).
          items: (outcome?.items ?? [])
            .filter((g) => g.gradedBy !== null)
            .map((g) => ({
              id: g.id,
              correct: g.correct === true,
              by: g.gradedBy,
            })),
        }
      : (priorBest ?? null);

    tx.set(summaryRef.collection('attempts').doc(String(attemptNo)), {
      attemptNo,
      submittedAt: nowMs,
      studentUid: caller.uid,
      kind: input.kind,
      payload,
      ...(outcome ? { items: outcome.items } : {}),
      ...(scored ?? {}),
    });
    tx.set(
      summaryRef,
      {
        submittedAt: nowMs,
        studentUid: caller.uid,
        ...staffFields,
        payload:
          isRecord(summary.payload) && summary.payload.completed === true
            ? { ...payload, completed: true }
            : payload,
        attemptCount: attemptNo,
        best,
        lastSubmittedAt: nowMs,
      },
      { merge: false }
    );

    const response: SubmitMiniAppResultResponse = {
      attempt: attemptNo,
      attemptsLeft: left(attemptNo),
    };
    if (session.showCorrectAnswers === false || !scored) return response;
    return {
      ...response,
      score: scored.score,
      maxScore: scored.maxScore,
      items: (outcome?.items ?? [])
        .filter((g) => g.correct !== null)
        .map((g) => ({ id: g.id, correct: g.correct === true })),
    };
  });
}

export const submitMiniAppResultV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  (request) => {
    assertViewAsAllowed(request);
    return handleSubmitMiniAppResult(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            studentRole: request.auth.token.studentRole === true,
            classIds: Array.isArray(request.auth.token.classIds)
              ? (request.auth.token.classIds as unknown[]).filter(
                  (c): c is string => typeof c === 'string' && c.length > 0
                )
              : [],
            staff: staffIdentityFromToken(request.auth.token),
          }
        : null,
      request.data,
      Date.now(),
      (uid, sessionId) => {
        const secret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
        if (!secret)
          throw new HttpsError('internal', 'Server configuration missing.');
        return computeAssignmentPseudonym(uid, sessionId, secret);
      }
    );
  }
);

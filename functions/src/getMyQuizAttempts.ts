// A student's own earlier quiz attempts, shown only as far as the quiz's results settings allow (docs/plans/QUIZ_ATTEMPT_HISTORY.md D3).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { loadSessionContext } from './gradebook/gradeIndex';
import { gradeGroupAnswer } from './plcAssessmentMath';
import { parseCompletedResponse } from './recomputePlcAssessments';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import {
  QUIZ_ATTEMPTS_SUBCOLLECTION,
  QUIZ_ATTEMPT_SCORES_COLLECTION,
} from './quizAttemptHistory';
import {
  resolveServerResultsVisibility,
  visibilityIncludesResponses,
} from './quizResultsVisibilityServer';
import { assertViewAsAllowed } from './viewAsGuard';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

export const ATTEMPT_HISTORY_FEATURE = 'quiz-attempt-history';
const MAX_ID_LENGTH = 128;

export interface MyAttemptAnswer {
  questionId: string;
  answer: string;
  isCorrect?: boolean;
  answeredAt?: number;
  takeIndex?: number;
}

export interface MyAttempt {
  n: number;
  submittedAt: number | null;
  /** Percent, or null while a written answer still needs a grade. */
  score: number | null;
  answers?: MyAttemptAnswer[];
  grading?: Doc;
  servedQuestionIds?: string[];
}

export interface MyAttemptsDeps {
  db: Firestore;
  now: () => number;
  teacherEmailOf: (uid: string) => Promise<string | null>;
}

const isId = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= MAX_ID_LENGTH &&
  !v.includes('/');

const asRecord = (v: unknown): Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Doc) : {};

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const pctOf = (points: number | null, max: number | null): number | null =>
  points !== null && max !== null && max > 0
    ? Math.round((points / max) * 100)
    : null;

/** The scored list entry for attempt `n`, which follows teacher grading of earlier attempts. */
function listScore(list: Doc | undefined, n: number): number | null {
  const entries: unknown = list?.attempts;
  if (!Array.isArray(entries)) return null;
  const hit = entries.map(asRecord).find((e) => e.n === n);
  if (!hit || hit.state !== 'scored') return null;
  return pctOf(num(hit.points), num(hit.max));
}

export async function handleGetMyQuizAttempts(
  deps: MyAttemptsDeps,
  callerUid: string | null,
  raw: unknown
): Promise<{ attempts: MyAttempt[] }> {
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const data = asRecord(raw);
  if (!isId(data.sessionId) || !isId(data.responseKey))
    throw new HttpsError('invalid-argument', 'Missing quiz or response.');
  const sessionRef = deps.db.collection('quiz_sessions').doc(data.sessionId);
  const responseRef = sessionRef.collection('responses').doc(data.responseKey);
  const [sessionSnap, responseSnap] = await Promise.all([
    sessionRef.get(),
    responseRef.get(),
  ]);
  const session = sessionSnap.data();
  const response = responseSnap.data();
  // The doc's own studentUid is the only ownership fact trusted.
  if (!session || !response || response.studentUid !== callerUid)
    throw new HttpsError('permission-denied', 'Not your quiz.');
  const none = { attempts: [] };
  const teacherUid =
    typeof session.teacherUid === 'string' ? session.teacherUid : '';
  if (!teacherUid) return none;
  // Mid-retake the earlier attempts stay hidden, as the client's results screen does.
  if (response.status !== 'completed' || response.resultsLockedOut === true)
    return none;
  const { visibility: resolved, source } = resolveServerResultsVisibility(
    session,
    response,
    deps.now()
  );
  // Score on submit shows the score before any publish, as utils/quizResultsVisibility.ts does.
  const visibility =
    resolved === 'none' &&
    session.showScoreOnSubmit === true &&
    typeof response.score === 'number' &&
    source === 'class'
      ? 'score-only'
      : resolved;
  if (visibility === 'none') return none;
  const granted = await isGlobalFeatureGranted(
    deps.db,
    ATTEMPT_HISTORY_FEATURE,
    await deps.teacherEmailOf(teacherUid),
    teacherUid
  );
  if (!granted) return none;

  const [copiesSnap, listSnap] = await Promise.all([
    responseRef.collection(QUIZ_ATTEMPTS_SUBCOLLECTION).get(),
    sessionRef
      .collection(QUIZ_ATTEMPT_SCORES_COLLECTION)
      .doc(data.responseKey)
      .get(),
  ]);
  const copies = copiesSnap.docs
    .map((d) => asRecord(d.data()))
    .filter((c) => c.closed === true && num(c.n) !== null)
    .sort((a, b) => Number(a.n) - Number(b.n));
  if (copies.length === 0) return none;

  const withResponses = visibilityIncludesResponses(visibility);
  const ctx = withResponses
    ? await loadSessionContext(deps.db, 'quiz', data.sessionId)
    : null;
  const byId = new Map((ctx?.quiz?.questions ?? []).map((q) => [q.id, q]));
  const fib = ctx?.quiz?.fibAnswersByStudent(callerUid) ?? {};
  const list = listSnap.data();

  const attempts = copies.map((c): MyAttempt => {
    const n = Number(c.n);
    const base: MyAttempt = {
      n,
      submittedAt: num(c.submittedAt),
      score: listScore(list, n) ?? num(c.score),
    };
    if (!withResponses) return base;
    const parsed = parseCompletedResponse(c);
    const answers = parsed.answers.map((a): MyAttemptAnswer => {
      const q = byId.get(a.questionId);
      const g = q
        ? gradeGroupAnswer(
            q,
            a.answer,
            parsed.manualGrades?.[q.id],
            q.type === 'FIB' ? fib[q.id] : undefined
          )
        : null;
      return {
        questionId: a.questionId,
        answer: a.answer,
        ...(g?.state === 'scored'
          ? { isCorrect: g.isCorrect }
          : typeof a.isCorrect === 'boolean'
            ? { isCorrect: a.isCorrect }
            : {}),
        ...(a.answeredAt !== undefined ? { answeredAt: a.answeredAt } : {}),
        ...(a.takeIndex !== undefined ? { takeIndex: a.takeIndex } : {}),
      };
    });
    return {
      ...base,
      answers,
      grading: asRecord(c.grading),
      ...(parsed.servedQuestionIds
        ? { servedQuestionIds: parsed.servedQuestionIds }
        : {}),
    };
  });
  return { attempts };
}

export const getMyQuizAttemptsV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  (request) => {
    assertViewAsAllowed(request, { read: true });
    return handleGetMyQuizAttempts(
      {
        db: admin.firestore(),
        now: () => Date.now(),
        teacherEmailOf: async (uid) => {
          try {
            return (await admin.auth().getUser(uid)).email ?? null;
          } catch {
            return null;
          }
        },
      },
      request.auth?.uid ?? null,
      request.data
    );
  }
);

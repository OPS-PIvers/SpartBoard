// Scores a student's submitted quiz attempt so they see it at once (quiz-score-on-submit).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  gradeGroupAnswer,
  parseSyncedQuestion,
  type GroupQuestion,
} from './plcAssessmentMath';
import { notChosenIds, parseChooseSections } from './quizSectionsChosen';

const SESSIONS = 'quiz_sessions';
const MAX_ID_LENGTH = 128;

export interface ScoreOnSubmitAnswer {
  questionId: string;
  answer?: string;
  answeredAt?: number;
  takeIndex?: number;
  unresponded?: unknown;
  isCorrect?: boolean;
  [extra: string]: unknown;
}

export interface KeyQuestion extends GroupQuestion {
  /** Needs a teacher grade; the whole attempt then waits for the teacher. */
  manual: boolean;
}

export interface ScoreContext {
  questions: KeyQuestion[];
  sections: ReturnType<typeof parseChooseSections>;
  /** Pointer override subset, used when the response has no snapshot. */
  overrideQuestionIds?: string[];
  /** Accepted FIB answers by question id for the locale this student was served. */
  fibAnswersByQuestion: Record<string, string[]>;
}

const isId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH &&
  !value.includes('/');

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};

const asStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];

/** Parses the teacher-written key doc; first entry wins on a duplicate id. */
export function parseKeyQuestions(raw: unknown): KeyQuestion[] {
  const byId = new Map<string, KeyQuestion>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    const parsed = parseSyncedQuestion(entry);
    if (!parsed || byId.has(parsed.id)) continue;
    const r = asRecord(entry);
    byId.set(parsed.id, {
      ...parsed,
      manual: parsed.type === 'free-response' || r.recording === true,
    });
  }
  return [...byId.values()];
}

/** Mirrors utils/answerTakeOrdering.ts: highest takeIndex, then earliest answeredAt. */
function representativeAnswers(
  answers: ScoreOnSubmitAnswer[]
): Map<string, ScoreOnSubmitAnswer> {
  const sorted = [...answers].sort((a, b) => {
    const ai = a.takeIndex ?? 0;
    const bi = b.takeIndex ?? 0;
    if (ai !== bi) return bi - ai;
    return (a.answeredAt ?? 0) - (b.answeredAt ?? 0);
  });
  const out = new Map<string, ScoreOnSubmitAnswer>();
  for (const a of sorted) if (!out.has(a.questionId)) out.set(a.questionId, a);
  return out;
}

/** Server twin of gradeResponseForPublish; null when any served question needs a teacher grade. */
export function scoreAttempt(
  response: Record<string, unknown>,
  ctx: ScoreContext
): { score: number; answers: ScoreOnSubmitAnswer[] } | null {
  const answers = (
    Array.isArray(response.answers) ? response.answers : []
  ).filter(
    (a): a is ScoreOnSubmitAnswer =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as ScoreOnSubmitAnswer).questionId === 'string'
  );
  const byId = new Map(ctx.questions.map((q) => [q.id, q]));
  const snapshot = asStringList(response.servedQuestionIds);
  const subset =
    snapshot.length > 0 ? snapshot : (ctx.overrideQuestionIds ?? []);
  const baseServed = subset.length > 0 ? subset : [...byId.keys()];
  const notChosen = notChosenIds(
    ctx.sections,
    answers,
    subset.length > 0 ? subset : undefined
  );
  const served = new Set(baseServed.filter((id) => !notChosen.has(id)));
  for (const id of served) {
    const q = byId.get(id);
    // A served question missing from the key (stale key) can't be vouched for.
    if (!q || q.manual || q.correctAnswer === null) return null;
  }

  const representative = representativeAnswers(answers);
  let earned = 0;
  let max = 0;
  const graded = answers.map((a) => {
    const q = byId.get(a.questionId);
    if (!q) {
      const { isCorrect: _stale, ...rest } = a;
      void _stale;
      return rest;
    }
    const result = gradeGroupAnswer(
      q,
      typeof a.answer === 'string' ? a.answer : '',
      undefined,
      q.type === 'FIB' ? ctx.fibAnswersByQuestion[q.id] : undefined
    );
    if (representative.get(a.questionId) === a && served.has(a.questionId)) {
      earned += result.pointsEarned;
      max += result.pointsMax;
    }
    return { ...a, isCorrect: result.isCorrect };
  });
  const answered = new Set(answers.map((a) => a.questionId));
  for (const [id, q] of byId) {
    if (served.has(id) && !answered.has(id)) max += q.points;
  }
  return {
    score: max === 0 ? 0 : Math.round((earned / max) * 100),
    answers: graded,
  };
}

/** Accepted translated FIB answers for the locale the teacher served this student. */
export function servedFibAnswers(
  assignment: Record<string, unknown>,
  studentUid: string
): Record<string, string[]> {
  const override = asRecord(
    asRecord(assignment.overridesByStudentUid)[studentUid]
  );
  const served = asRecord(assignment.servedLanguageByStudentUid)[studentUid];
  const locale =
    typeof override.language === 'string'
      ? override.language
      : typeof served === 'string'
        ? served
        : null;
  if (!locale) return {};
  const out: Record<string, string[]> = {};
  for (const [qid, byLocale] of Object.entries(
    asRecord(assignment.localizedFibAnswers)
  )) {
    const list = asStringList(asRecord(byLocale)[locale]).filter(
      (a) => a.trim() !== ''
    );
    if (list.length > 0) out[qid] = list;
  }
  return out;
}

export async function handleScoreQuizOnSubmit(
  db: admin.firestore.Firestore,
  callerUid: string | null,
  rawInput: unknown
): Promise<{ score: number | null }> {
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const sessionId = asRecord(rawInput).sessionId;
  if (!isId(sessionId))
    throw new HttpsError('invalid-argument', 'sessionId is required.');
  const sessionRef = db.collection(SESSIONS).doc(sessionId);
  const [sessionSnap, responseSnap] = await Promise.all([
    sessionRef.get(),
    sessionRef
      .collection('responses')
      .where('studentUid', '==', callerUid)
      .limit(1)
      .get(),
  ]);
  if (!sessionSnap.exists) throw new HttpsError('not-found', 'Quiz not found.');
  if (responseSnap.empty)
    throw new HttpsError('permission-denied', 'Join the quiz first.');
  const session = sessionSnap.data() ?? {};
  const responseRef = responseSnap.docs[0].ref;
  const first = responseSnap.docs[0].data();
  if (typeof first.score === 'number') return { score: first.score };
  if (session.showScoreOnSubmit !== true || first.status !== 'completed')
    return { score: null };
  const teacherUid: unknown = session.teacherUid;
  const assignmentId = isId(session.assignmentId)
    ? session.assignmentId
    : sessionId;
  if (!isId(teacherUid)) return { score: null };
  const assignmentRef = db
    .collection('users')
    .doc(teacherUid)
    .collection('quiz_assignments')
    .doc(assignmentId);
  const [keySnap, assignmentSnap] = await Promise.all([
    assignmentRef.collection('key').doc('answers').get(),
    assignmentRef.get(),
  ]);
  if (!keySnap.exists) return { score: null };
  const assignment = assignmentSnap.data() ?? {};
  const ctx: ScoreContext = {
    questions: parseKeyQuestions(keySnap.data()?.questions),
    sections: parseChooseSections(session.sections),
    overrideQuestionIds: asStringList(
      asRecord(asRecord(assignment.overridesByStudentUid)[callerUid])
        .questionIds
    ),
    fibAnswersByQuestion: servedFibAnswers(assignment, callerUid),
  };
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(responseRef);
    const data = snap.data() ?? {};
    if (typeof data.score === 'number') return { score: data.score };
    if (data.status !== 'completed') return { score: null };
    // One score per attempt: a cleared score with edited answers must not re-grade.
    const attempt =
      typeof data.completedAttempts === 'number' ? data.completedAttempts : 0;
    const stamped: unknown = data.scoredOnSubmitAttempt;
    if (typeof stamped === 'number' && attempt <= stamped)
      return { score: null };
    const result = scoreAttempt(data, ctx);
    if (!result) return { score: null };
    tx.update(responseRef, {
      score: result.score,
      answers: result.answers,
      scoredOnSubmitAttempt: attempt,
    });
    return { score: result.score };
  });
}

export const scoreQuizOnSubmitV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  (request) =>
    handleScoreQuizOnSubmit(
      admin.firestore(),
      request.auth?.uid ?? null,
      request.data
    )
);

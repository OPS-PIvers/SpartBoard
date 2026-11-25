// Scores a student's submitted quiz attempt so they see it at once (quiz-score-on-submit).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  fibExtrasFor,
  parseSyncedQuestion,
  type GroupQuestion,
  type RawAnswer,
} from './plcAssessmentMath';
import { fibExtrasParts, type FibExtras } from './quizFibMatch';
import { parseChooseSections, parseCountedChoices } from './quizSectionsChosen';
import { assertViewAsAllowed } from './viewAsGuard';
import { scoreResponseTotal } from './quizResponseTotal';
import { parsePaperWrittenQuestionIds } from './recomputePlcAssessments';
import { calcAttemptKey } from './quizCalculated';
import {
  resolveServerResultsVisibility,
  visibilityIncludesResponses,
} from './quizResultsVisibilityServer';

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
  fibAnswersByQuestion: Record<string, FibExtras>;
  /** The student gets the modified version; a typed-number answer on the key grades them. */
  modified?: boolean;
  /** Hybrid paper quiz: written questions wait for the teacher. */
  paperWrittenQuestionIds?: string[];
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
export function representativeAnswers<
  T extends { questionId: string; takeIndex?: number; answeredAt?: number },
>(answers: T[]): Map<string, T> {
  const sorted = [...answers].sort((a, b) => {
    const ai = a.takeIndex ?? 0;
    const bi = b.takeIndex ?? 0;
    if (ai !== bi) return bi - ai;
    return (a.answeredAt ?? 0) - (b.answeredAt ?? 0);
  });
  const out = new Map<string, T>();
  for (const a of sorted) if (!out.has(a.questionId)) out.set(a.questionId, a);
  return out;
}

/** The answers without per-question verdicts, for a student who may not see right/wrong. */
export function withoutVerdicts(
  answers: ScoreOnSubmitAnswer[]
): ScoreOnSubmitAnswer[] {
  return answers.map((a) => {
    const { isCorrect: _hidden, ...rest } = a;
    void _hidden;
    return rest;
  });
}

/** Server twin of gradeResponseForPublish; null when any served question needs a teacher grade. */
export function scoreAttempt(
  response: Record<string, unknown>,
  ctx: ScoreContext,
  /** The response doc id; fixes the student's random numbers. */
  responseKey?: string
): {
  score: number;
  answers: ScoreOnSubmitAnswer[];
  points: { earned: number; possible: number; attempt: number };
} | null {
  const answers = (
    Array.isArray(response.answers) ? response.answers : []
  ).filter(
    (a): a is ScoreOnSubmitAnswer =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as ScoreOnSubmitAnswer).questionId === 'string'
  );
  // The shared total reads plain answers; this maps each back to the student's entry.
  const raw = answers.map((a): RawAnswer => ({
    ...a,
    answer: typeof a.answer === 'string' ? a.answer : '',
  }));
  const entryOf = new Map(raw.map((r, i) => [r, i]));
  const snapshot = asStringList(response.servedQuestionIds);
  const subset =
    snapshot.length > 0 ? snapshot : (ctx.overrideQuestionIds ?? []);
  const total = scoreResponseTotal({
    questions: ctx.questions,
    answers: raw,
    servedQuestionIds: subset,
    sections: ctx.sections,
    countedChoices: parseCountedChoices(response),
    fibAnswersFor: (id) => ctx.fibAnswersByQuestion[id],
    paperWrittenQuestionIds: ctx.paperWrittenQuestionIds,
    calcKey: responseKey ? calcAttemptKey(responseKey, response) : undefined,
    modified: ctx.modified === true,
  });
  // A served question missing from the key (stale key) can't be vouched for.
  if (total.unknownServed.length > 0 || total.noKey || total.awaiting)
    return null;
  const manual = new Set(
    ctx.questions.filter((q) => q.manual).map((q) => q.id)
  );
  if (total.questions.some((t) => t.counted && manual.has(t.question.id)))
    return null;

  // Only the graded answer per served question gets a verdict, so extra entries can't probe the key.
  const verdicts = new Map<number, boolean>();
  for (const t of total.questions) {
    const i = t.answer ? entryOf.get(t.answer) : undefined;
    if (i !== undefined) verdicts.set(i, t.grade.isCorrect);
  }
  const graded = answers.map((a, i) => {
    const { isCorrect: _stale, ...rest } = a;
    void _stale;
    const verdict = verdicts.get(i);
    return verdict === undefined ? rest : { ...rest, isCorrect: verdict };
  });
  return {
    score: total.max === 0 ? 0 : Math.round((total.earned / total.max) * 100),
    answers: graded,
    points: {
      earned: total.earned,
      possible: total.max,
      attempt:
        typeof response.completedAttempts === 'number'
          ? response.completedAttempts
          : 0,
    },
  };
}

/** Accepted translated FIB answers for the locale the teacher served this student, plus teacher-accepted ones. */
export function servedFibAnswers(
  assignment: Record<string, unknown>,
  studentUid: string
): Record<string, FibExtras> {
  const override = asRecord(
    asRecord(assignment.overridesByStudentUid)[studentUid]
  );
  const served = asRecord(assignment.servedLanguageByStudentUid)[studentUid];
  const locale =
    typeof override.language === 'string'
      ? override.language
      : typeof served === 'string'
        ? served
        : undefined;
  const lenient = asStringList(assignment.lenientFibLocales);
  const out: Record<string, FibExtras> = {};
  for (const [qid, byLocale] of Object.entries(
    asRecord(assignment.localizedFibAnswers)
  )) {
    const extras = fibExtrasFor(asRecord(byLocale), locale, lenient);
    if (fibExtrasParts(extras).answers.length > 0) out[qid] = extras;
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
    paperWrittenQuestionIds: parsePaperWrittenQuestionIds(
      session.paperWrittenQuestionIds
    ),
    // Only a student-paced session shows the modified prompt.
    modified:
      session.sessionMode === 'student' &&
      asRecord(asRecord(assignment.overridesByStudentUid)[callerUid])
        .modifiedQuestions === true,
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
    const result = scoreAttempt(data, ctx, snap.id);
    if (!result) return { score: null };
    // Right/wrong stays off the student-readable doc unless their results show responses.
    const { visibility } = resolveServerResultsVisibility(
      session,
      data,
      Date.now()
    );
    tx.update(responseRef, {
      score: result.score,
      scorePoints: result.points,
      answers: visibilityIncludesResponses(visibility)
        ? result.answers
        : withoutVerdicts(result.answers),
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
  async (request) => {
    await assertViewAsAllowed(request);
    return handleScoreQuizOnSubmit(
      admin.firestore(),
      request.auth?.uid ?? null,
      request.data
    );
  }
);

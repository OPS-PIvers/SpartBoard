// Grades one self-paced Review game answer on the server (QUIZ_REVIEW_SPLIT.md D24, D25, D31).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { gradeGroupAnswer } from './plcAssessmentMath';
import { parseKeyQuestions, servedFibAnswers } from './quizScoreOnSubmit';
import { withQuizSessionContent } from './quizSessionContent';

const SESSIONS = 'quiz_sessions';
const MAX_ID_LENGTH = 128;
const MAX_ANSWER_LENGTH = 5000;
export const QUIZ_REVIEW_SPLIT_FEATURE = 'quiz-review-split';
/** Answers sent just before the clock ran out or the teacher paused still count. */
export const GAME_CLOCK_GRACE_MS = 2_000;
const MAX_SPEED_BONUS_PCT = 50;
const FLAG_CACHE_MS = 60_000;

/** HttpsError details reasons the student engine branches on. */
export const GAME_REFUSAL = {
  notStarted: 'game-not-started',
  paused: 'game-paused',
  over: 'game-over',
  repeat: 'same-question-twice',
} as const;

export interface CheckQuizGameAnswerInput {
  sessionId: string;
  questionId: string;
  answer: string;
  /** Server-clock ms when the device showed the question (useServerNow). */
  startedAt?: number;
}

/** Server-written game state on a response doc; students can't write it (firestore.rules). */
export interface QuizGameState {
  points: number;
  streak: number;
  answered: number;
  correct: number;
  /** First try per question: true only for full credit (D25). */
  firstTry: Record<string, boolean>;
  /** Latest try per question, so a reloaded device can rebuild its repeat queue (D23). */
  lastCorrect: Record<string, boolean>;
  last: QuizGameLastAnswer | null;
}

export interface QuizGameLastAnswer {
  questionId: string;
  answer: string;
  isCorrect: boolean;
  points: number;
  speedBonus: number;
  firstTry: boolean;
  at: number;
}

export interface CheckQuizGameAnswerResult {
  isCorrect: boolean;
  /** Points this answer earned, bonuses included. */
  points: number;
  speedBonus: number;
  streak: number;
  totalPoints: number;
  /** Raw key answer; the device formats it for display. */
  correctAnswer: string;
  firstTry: boolean;
}

export interface CheckQuizGameAnswerDeps {
  /** Whether the session teacher has the quiz-review-split flag. */
  isFlagOn?: (
    db: admin.firestore.Firestore,
    teacherUid: string
  ) => Promise<boolean>;
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

const asBoolMap = (value: unknown): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(asRecord(value)))
    if (typeof v === 'boolean') out[k] = v;
  return out;
};

// Partial credit is fractional, so points keep two decimals and the board rounds for display.
const round2 = (n: number): number => Math.round(n * 100) / 100;

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Timestamp or epoch ms; null when absent. */
export const stampMillis = (value: unknown): number | null =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : typeof value === 'number' && Number.isFinite(value)
      ? value
      : null;

export function parseCheckQuizGameAnswerInput(
  raw: unknown
): CheckQuizGameAnswerInput {
  const data = asRecord(raw);
  if (!isId(data.sessionId) || !isId(data.questionId))
    throw new HttpsError(
      'invalid-argument',
      'sessionId and questionId are required.'
    );
  if (typeof data.answer !== 'string' || data.answer.length > MAX_ANSWER_LENGTH)
    throw new HttpsError(
      'invalid-argument',
      'answer must be a string of at most 5000 characters.'
    );
  const startedAt = data.startedAt;
  return {
    sessionId: data.sessionId,
    questionId: data.questionId,
    answer: data.answer,
    ...(typeof startedAt === 'number' && Number.isFinite(startedAt)
      ? { startedAt }
      : {}),
  };
}

export function parseGameState(raw: unknown): QuizGameState {
  const r = asRecord(raw);
  const last = asRecord(r.last);
  return {
    points: num(r.points),
    streak: num(r.streak),
    answered: num(r.answered),
    correct: num(r.correct),
    firstTry: asBoolMap(r.firstTry),
    lastCorrect: asBoolMap(r.lastCorrect),
    last:
      typeof last.questionId === 'string'
        ? {
            questionId: last.questionId,
            answer: typeof last.answer === 'string' ? last.answer : '',
            isCorrect: last.isCorrect === true,
            points: num(last.points),
            speedBonus: num(last.speedBonus),
            firstTry: last.firstTry === true,
            at: num(last.at),
          }
        : null,
  };
}

/** Why the game clock refuses an answer at `nowMs`, or null when it is running (D22). */
export function gameClockRefusal(
  session: Record<string, unknown>,
  nowMs: number
): (typeof GAME_REFUSAL)[keyof typeof GAME_REFUSAL] | null {
  if (session.status === 'ended') return GAME_REFUSAL.over;
  const endsAt = stampMillis(session.gameEndsAt);
  if (endsAt === null) return GAME_REFUSAL.notStarted;
  const pausedAt = stampMillis(session.gamePausedAt);
  if (pausedAt !== null && nowMs > pausedAt + GAME_CLOCK_GRACE_MS)
    return GAME_REFUSAL.paused;
  if (session.status === 'paused') return GAME_REFUSAL.paused;
  if (nowMs > endsAt + GAME_CLOCK_GRACE_MS) return GAME_REFUSAL.over;
  return null;
}

/** Mirrors streakMultiplier in components/widgets/QuizWidget/utils/quizScoreboard.ts. */
export function streakMultiplier(consecutiveCorrect: number): number {
  if (consecutiveCorrect >= 3) return 2;
  if (consecutiveCorrect === 2) return 1.5;
  return 1;
}

/** Mirrors applyTimeMultiplier in utils/quizOverrideServing.ts: 0 means untimed. */
export function effectiveTimeLimitSec(
  seconds: number,
  multiplier: unknown
): number {
  if (!seconds || seconds <= 0) return 0;
  if (multiplier === 'unlimited') return 0;
  if (multiplier === 1.5 || multiplier === 2)
    return Math.round(seconds * multiplier);
  return seconds;
}

/** Device start time clamped to the limit and to when the answer arrived (D31). */
export function speedBonusPct(
  limitSec: number,
  startedAt: number | undefined,
  nowMs: number
): number {
  if (limitSec <= 0 || startedAt === undefined) return 0;
  const limitMs = limitSec * 1000;
  const elapsed = Math.min(limitMs, Math.max(0, nowMs - startedAt));
  return Math.round(((limitMs - elapsed) / limitMs) * MAX_SPEED_BONUS_PCT);
}

const flagCache = new Map<string, { on: boolean; at: number }>();

/** Server twin of canAccessFeature('quiz-review-split') for the session teacher. */
async function teacherHasFlag(
  db: admin.firestore.Firestore,
  teacherUid: string
): Promise<boolean> {
  const cached = flagCache.get(teacherUid);
  if (cached && Date.now() - cached.at < FLAG_CACHE_MS) return cached.on;
  const email = await admin
    .auth()
    .getUser(teacherUid)
    .then((u) => u.email ?? null)
    .catch(() => null);
  const { isGlobalFeatureGranted } = await import('./quizMediaArchive');
  const on = await isGlobalFeatureGranted(
    db,
    QUIZ_REVIEW_SPLIT_FEATURE,
    email,
    teacherUid
  ).catch(() => false);
  flagCache.set(teacherUid, { on, at: Date.now() });
  return on;
}

export async function handleCheckQuizGameAnswer(
  db: admin.firestore.Firestore,
  callerUid: string | null,
  rawInput: unknown,
  nowMs = Date.now(),
  deps: CheckQuizGameAnswerDeps = {}
): Promise<CheckQuizGameAnswerResult> {
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const input = parseCheckQuizGameAnswerInput(rawInput);
  const sessionRef = db.collection(SESSIONS).doc(input.sessionId);
  const [sessionSnap, responseSnap] = await Promise.all([
    sessionRef.get(),
    sessionRef
      .collection('responses')
      .where('studentUid', '==', callerUid)
      .limit(1)
      .get(),
  ]);
  if (!sessionSnap.exists) throw new HttpsError('not-found', 'Game not found.');
  const session = sessionSnap.data() ?? {};
  // Only self-paced Review games use this grader; every other quiz keeps its own path.
  if (session.sessionMode !== 'game')
    throw new HttpsError('failed-precondition', 'This quiz is not a game.');
  const teacherUid: unknown = session.teacherUid;
  if (!isId(teacherUid))
    throw new HttpsError('failed-precondition', 'This game has no teacher.');
  if (responseSnap.empty)
    throw new HttpsError('permission-denied', 'Join the game first.');
  const flagOn = await (deps.isFlagOn ?? teacherHasFlag)(db, teacherUid);
  if (!flagOn)
    throw new HttpsError(
      'permission-denied',
      'Review games are not available for this class.'
    );
  const clock = gameClockRefusal(session, nowMs);
  if (clock)
    throw new HttpsError('failed-precondition', 'The game is not running.', {
      reason: clock,
    });

  const assignmentId = isId(session.assignmentId)
    ? session.assignmentId
    : input.sessionId;
  const assignmentRef = db
    .collection('users')
    .doc(teacherUid)
    .collection('quiz_assignments')
    .doc(assignmentId);
  const [keySnap, assignmentSnap, withContent] = await Promise.all([
    assignmentRef.collection('key').doc('answers').get(),
    assignmentRef.get(),
    withQuizSessionContent(sessionRef, session),
  ]);
  if (!keySnap.exists)
    throw new HttpsError('failed-precondition', 'This game has no answer key.');
  const question = parseKeyQuestions(keySnap.data()?.questions).find(
    (q) => q.id === input.questionId
  );
  // Following #3635: a question the key can't vouch for is never graded.
  if (!question || question.correctAnswer === null)
    throw new HttpsError('not-found', 'Question not found in this game.');
  if (question.manual)
    throw new HttpsError(
      'failed-precondition',
      "This question can't be auto-scored."
    );
  const assignment = assignmentSnap.data() ?? {};
  const override = asRecord(
    asRecord(assignment.overridesByStudentUid)[callerUid]
  );
  const publicQuestion = (
    Array.isArray(withContent.publicQuestions)
      ? (withContent.publicQuestions as unknown[])
      : []
  )
    .map(asRecord)
    .find((q) => q.id === question.id);
  const limitSec = effectiveTimeLimitSec(
    num(publicQuestion?.timeLimit),
    override.timeMultiplier
  );
  const fibAnswers =
    question.type === 'FIB'
      ? servedFibAnswers(assignment, callerUid)[question.id]
      : undefined;
  const speedOn = session.speedBonusEnabled === true;
  const streakOn = session.streakBonusEnabled === true;
  const responseRef = responseSnap.docs[0].ref;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(responseRef);
    const data = snap.data() ?? {};
    const served = Array.isArray(data.servedQuestionIds)
      ? (data.servedQuestionIds as unknown[])
      : null;
    if (served && served.length > 0 && !served.includes(question.id))
      throw new HttpsError('not-found', 'Question not found in this game.');
    const state = parseGameState(data.game);
    // D23 never serves a question twice in a row; a retried call gets its first result back.
    if (state.last?.questionId === question.id) {
      if (state.last.answer === input.answer)
        return {
          isCorrect: state.last.isCorrect,
          points: state.last.points,
          speedBonus: state.last.speedBonus,
          streak: state.streak,
          totalPoints: state.points,
          correctAnswer: question.correctAnswer ?? '',
          firstTry: state.last.firstTry,
        };
      throw new HttpsError(
        'failed-precondition',
        'Answer a different question first.',
        { reason: GAME_REFUSAL.repeat }
      );
    }
    const grade = gradeGroupAnswer(
      question,
      input.answer,
      undefined,
      fibAnswers
    );
    // Partial credit keeps its points but holds the streak and counts as missed (D24).
    const streak = grade.isCorrect
      ? state.streak + 1
      : grade.pointsEarned > 0
        ? state.streak
        : 0;
    const speedBonus =
      speedOn && grade.pointsEarned > 0
        ? speedBonusPct(limitSec, input.startedAt, nowMs)
        : 0;
    let raw = grade.pointsEarned * (1 + speedBonus / 100);
    if (streakOn && grade.pointsEarned > 0) raw *= streakMultiplier(streak);
    const points = round2(raw);
    const isFirstTry = !(question.id in state.firstTry);
    const answers: unknown[] = Array.isArray(data.answers)
      ? (data.answers as unknown[])
      : [];
    const last: QuizGameLastAnswer = {
      questionId: question.id,
      answer: input.answer,
      isCorrect: grade.isCorrect,
      points,
      speedBonus,
      firstTry: isFirstTry,
      at: nowMs,
    };
    const next: QuizGameState = {
      points: round2(state.points + points),
      streak,
      answered: state.answered + 1,
      correct: state.correct + (grade.isCorrect ? 1 : 0),
      firstTry: isFirstTry
        ? { ...state.firstTry, [question.id]: grade.isCorrect }
        : state.firstTry,
      lastCorrect: { ...state.lastCorrect, [question.id]: grade.isCorrect },
      last,
    };
    tx.update(responseRef, {
      game: next,
      // `answers` keeps the first try per question, so results read first-try accuracy (D25).
      ...(isFirstTry
        ? {
            answers: [
              ...answers,
              {
                questionId: question.id,
                answer: input.answer,
                answeredAt: nowMs,
                isCorrect: grade.isCorrect,
                ...(speedBonus > 0 ? { speedBonus } : {}),
              },
            ],
          }
        : {}),
      ...(data.status === 'joined' ? { status: 'in-progress' } : {}),
      lastWriteAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      isCorrect: grade.isCorrect,
      points,
      speedBonus,
      streak,
      totalPoints: next.points,
      correctAnswer: question.correctAnswer ?? '',
      firstTry: isFirstTry,
    };
  });
}

export const checkQuizGameAnswerV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  (request) =>
    handleCheckQuizGameAnswer(
      admin.firestore(),
      request.auth?.uid ?? null,
      request.data
    )
);

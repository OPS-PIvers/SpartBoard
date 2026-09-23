// Video Activity answer key: server grading for students, and the scrub that keeps the key off session docs.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isPeriodFrozen } from './quizSessionContent';
import {
  dedupeById,
  gradeVaAnswer,
  hasEmbeddedKey,
  toVaPublicQuestion,
  type VaKeyQuestion,
} from './videoActivityGrade';

const SESSIONS = 'video_activity_sessions';
const MAX_ID_LENGTH = 128;
const MAX_ANSWER_LENGTH = 2000;
const CLOSE_GRACE_MS = 120_000;

export interface CheckVideoActivityAnswerInput {
  sessionId: string;
  questionId: string;
  answer: string;
}

export interface CheckVideoActivityAnswerResult {
  isCorrect: boolean;
  correctAnswer: string;
}

const isId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH &&
  !value.includes('/');

export function parseCheckVideoActivityAnswerInput(
  raw: unknown
): CheckVideoActivityAnswerInput {
  const data =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  if (!isId(data.sessionId) || !isId(data.questionId))
    throw new HttpsError(
      'invalid-argument',
      'sessionId and questionId are required.'
    );
  if (typeof data.answer !== 'string' || data.answer.length > MAX_ANSWER_LENGTH)
    throw new HttpsError(
      'invalid-argument',
      'answer must be a string of at most 2000 characters.'
    );
  return {
    sessionId: data.sessionId,
    questionId: data.questionId,
    answer: data.answer,
  };
}

const keyRef = (db: admin.firestore.Firestore, sessionId: string) =>
  db.collection(SESSIONS).doc(sessionId).collection('key').doc('answers');

const keyQuestions = (raw: unknown): VaKeyQuestion[] =>
  Array.isArray(raw)
    ? raw.filter(
        (q): q is VaKeyQuestion =>
          typeof q === 'object' &&
          q !== null &&
          typeof (q as VaKeyQuestion).id === 'string'
      )
    : [];

// Mirrors the player's no-skip order; a scripted client can still walk it, but recorded answers are locked.
export function allEarlierAnswered(
  questions: VaKeyQuestion[],
  target: VaKeyQuestion,
  rawAnswers: unknown
): boolean {
  const answered = new Set(
    Array.isArray(rawAnswers)
      ? rawAnswers
          .map((a: unknown) =>
            typeof a === 'object' && a !== null
              ? (a as { questionId?: unknown }).questionId
              : undefined
          )
          .filter((id): id is string => typeof id === 'string')
      : []
  );
  const at = target.timestamp ?? 0;
  return questions.every(
    (q) => q.id === target.id || (q.timestamp ?? 0) >= at || answered.has(q.id)
  );
}

export async function handleCheckVideoActivityAnswer(
  db: admin.firestore.Firestore,
  callerUid: string | null,
  rawInput: unknown,
  nowMs = Date.now()
): Promise<CheckVideoActivityAnswerResult> {
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const input = parseCheckVideoActivityAnswerInput(rawInput);
  const sessionRef = db.collection(SESSIONS).doc(input.sessionId);
  const [sessionSnap, keySnap, responseSnap] = await Promise.all([
    sessionRef.get(),
    keyRef(db, input.sessionId).get(),
    sessionRef
      .collection('responses')
      .where('studentUid', '==', callerUid)
      .limit(1)
      .get(),
  ]);
  if (!sessionSnap.exists)
    throw new HttpsError('not-found', 'Activity not found.');
  const session = sessionSnap.data() ?? {};
  const isTeacher = session.teacherUid === callerUid;
  const isViewOnly = session.mode === 'view-only';
  // Joined students, the owning teacher (preview), and view-only share viewers.
  if (responseSnap.empty && !isTeacher && !isViewOnly)
    throw new HttpsError('permission-denied', 'Join the activity first.');

  // Docs the scrub trigger has not reached yet still embed the key.
  const questions = keySnap.exists
    ? keyQuestions(keySnap.data()?.questions)
    : hasEmbeddedKey(session.questions)
      ? keyQuestions(session.questions)
      : [];
  const question = questions.find((q) => q.id === input.questionId);
  if (!question)
    throw new HttpsError('not-found', 'Question not found in this activity.');
  const settings = (session.settings ?? {}) as {
    allowSkipping?: boolean;
    requireCorrectAnswer?: boolean;
  };
  const result = (answer: string): CheckVideoActivityAnswerResult => ({
    isCorrect: gradeVaAnswer(question, answer),
    correctAnswer: question.correctAnswer ?? '',
  });
  const responseDoc = responseSnap.docs[0];
  if (isTeacher || isViewOnly || !responseDoc) return result(input.answer);
  if (isPeriodFrozen(session, responseDoc.data(), nowMs))
    throw new HttpsError(
      'failed-precondition',
      "Your class period isn't open right now."
    );
  if (
    settings.allowSkipping !== true &&
    !allEarlierAnswered(questions, question, responseDoc.data().answers)
  )
    throw new HttpsError(
      'failed-precondition',
      'Answer the earlier questions first.'
    );
  // Require-correct mode only ever records correct answers, so revealing the key can't change a score.
  if (settings.requireCorrectAnswer !== false) return result(input.answer);
  // Otherwise the checked answer is the graded one: record it first, so probing spends the attempt.
  const closeAt: unknown = session.closeAt;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(responseDoc.ref);
    const data = snap.data() ?? {};
    const answers = Array.isArray(data.answers)
      ? (data.answers as { questionId?: unknown; answer?: unknown }[])
      : [];
    const recorded = answers.find((a) => a?.questionId === question.id);
    if (recorded)
      return result(typeof recorded.answer === 'string' ? recorded.answer : '');
    const closed =
      typeof closeAt === 'number' &&
      nowMs > closeAt + CLOSE_GRACE_MS &&
      data.unlocked !== true;
    if (data.completedAt == null && !closed)
      tx.update(responseDoc.ref, {
        answers: [
          ...answers,
          {
            questionId: question.id,
            answer: input.answer,
            answeredAt: nowMs,
            isCorrect: gradeVaAnswer(question, input.answer),
          },
        ],
      });
    return result(input.answer);
  });
}

export const checkVideoActivityAnswerV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  (request) =>
    handleCheckVideoActivityAnswer(
      admin.firestore(),
      request.auth?.uid ?? null,
      request.data
    )
);

const stampMillis = (value: unknown): number | null =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : typeof value === 'number'
      ? value
      : null;

/** Moves an embedded key into `key/answers`; drops the key doc when the session goes. */
export async function scrubVideoActivitySessionKey(
  db: admin.firestore.Firestore,
  sessionId: string,
  after: Record<string, unknown> | null,
  before: Record<string, unknown> | null = null
): Promise<'deleted' | 'scrubbed' | 'clean' | 'deferred'> {
  if (!after) {
    await Promise.all([
      keyRef(db, sessionId).delete(),
      db
        .collection(SESSIONS)
        .doc(sessionId)
        .collection('content')
        .doc('questions')
        .delete(),
    ]);
    return 'deleted';
  }
  if (!hasEmbeddedKey(after.questions)) return 'clean';
  // A pre-release tab reads `questions` directly, so a live session (even one it just created) keeps it until it ends or the backfill asks.
  const requested = stampMillis(after.keyScrubRequestedAt);
  const backfillAsked =
    requested !== null &&
    requested !== stampMillis(before?.keyScrubRequestedAt);
  if (after.status === 'active' && !backfillAsked) return 'deferred';
  const questions = dedupeById(keyQuestions(after.questions));
  const batch = db.batch();
  batch.set(keyRef(db, sessionId), { questions });
  batch.update(db.collection(SESSIONS).doc(sessionId), {
    questions: [],
    publicQuestions: questions.map(toVaPublicQuestion),
  });
  await batch.commit();
  return 'scrubbed';
}

export const scrubVideoActivitySessionKeyV1 = onDocumentWritten(
  {
    document: `${SESSIONS}/{sessionId}`,
    memory: '256MiB',
    maxInstances: 10,
  },
  async (event) => {
    const { sessionId } = event.params;
    if (!event.data) return;
    const { after, before } = event.data;
    const result = await scrubVideoActivitySessionKey(
      admin.firestore(),
      sessionId,
      after.exists ? (after.data() ?? {}) : null,
      before.exists ? (before.data() ?? {}) : null
    );
    if (result === 'scrubbed')
      logger.info('scrubVideoActivitySessionKeyV1: moved embedded key', {
        sessionId,
      });
  }
);

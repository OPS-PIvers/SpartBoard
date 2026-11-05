// Video Activity answer key: server grading for students, and the scrub that keeps the key off session docs.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isPeriodFrozen } from './quizSessionContent';
import {
  dedupeById,
  gradeVaAnswer,
  hasEmbeddedKey,
  isVaShortAnswer,
  toVaPublicQuestion,
  vaAnswerRules,
  type VaKeyQuestion,
} from './videoActivityGrade';
import { assertViewAsAllowed } from './viewAsGuard';

const SESSIONS = 'video_activity_sessions';
const MAX_ID_LENGTH = 128;
const MAX_ANSWER_LENGTH = 2000;
const CLOSE_GRACE_MS = 120_000;
/** HttpsError details reason for a live answer outside its open window (D20). */
export const QUESTION_CLOSED_REASON = 'question-closed';

export interface CheckVideoActivityAnswerInput {
  sessionId: string;
  questionId: string;
  answer: string;
}

export interface CheckVideoActivityAnswerResult {
  /** Null when right and wrong is hidden from this caller. */
  isCorrect: boolean | null;
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

/** Teacher-paced sessions accept an answer only for the open question (D8, D20). */
export function isLiveQuestionOpen(
  session: Record<string, unknown>,
  questionId: string
): boolean {
  const live = session.live as
    { currentQuestionId?: unknown; questionPhase?: unknown } | undefined;
  return (
    live?.currentQuestionId === questionId &&
    live.questionPhase === 'open' &&
    (live as { answerRevealed?: unknown }).answerRevealed !== true
  );
}

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

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

/** Response field holding what this callable recorded, which the student rule can't write. */
export const CHECKED_ANSWERS_FIELD = 'checkedAnswers';
const NO_VERDICT: CheckVideoActivityAnswerResult = {
  isCorrect: null,
  correctAnswer: '',
};

type AnswerEntry = {
  questionId?: unknown;
  answer?: unknown;
  isCorrect?: unknown;
};
const answerList = (data: Record<string, unknown>): AnswerEntry[] =>
  Array.isArray(data.answers) ? (data.answers as AnswerEntry[]) : [];
const attemptOf = (data: Record<string, unknown>): number =>
  typeof data.completedAttempts === 'number' ? data.completedAttempts : 0;

/** The answer this callable recorded for the question in this attempt, while it is still the scored one. */
export function serverRecordedAnswer(
  data: Record<string, unknown>,
  questionId: string
): string | null {
  const rec = asRecord(asRecord(data[CHECKED_ANSWERS_FIELD])[questionId]);
  if (typeof rec.answer !== 'string' || rec.attempt !== attemptOf(data))
    return null;
  const first = answerList(data).find((a) => a?.questionId === questionId);
  return first?.answer === rec.answer ? rec.answer : null;
}

// Docs the scrub trigger has not reached yet still embed the key.
const sessionKeyQuestions = (
  keySnap: { exists: boolean; data: () => Record<string, unknown> | undefined },
  session: Record<string, unknown>
): VaKeyQuestion[] =>
  keySnap.exists
    ? keyQuestions(keySnap.data()?.questions)
    : hasEmbeddedKey(session.questions)
      ? keyQuestions(session.questions)
      : [];

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

  const questions = sessionKeyQuestions(keySnap, session);
  const question = questions.find((q) => q.id === input.questionId);
  if (!question)
    throw new HttpsError('not-found', 'Question not found in this activity.');
  const settings = (session.settings ?? {}) as {
    allowSkipping?: boolean;
    requireCorrectAnswer?: boolean;
  };
  const rules = vaAnswerRules(session.settings, session.sessionOptions);
  const responseDoc = responseSnap.docs[0];
  const isLive = session.sessionMode === 'teacher';
  const isStudent = !isTeacher && !isViewOnly && !!responseDoc;
  // PIN joins and share views cost nothing to repeat; a uid-keyed response belongs to a signed-in student.
  const freeIdentity = !isTeacher && responseDoc?.id !== callerUid;
  // A live student waits for the board's reveal, and a hidden answer never leaves the server.
  const withholdKey =
    (isLive && isStudent) || (!isTeacher && !rules.revealAnswer);
  // Right and wrong waits for the reveal too, and a hidden key's verdicts never go to a free identity.
  const withholdResult =
    !isTeacher &&
    (isLive || !rules.showResult || (!rules.revealAnswer && freeIdentity));
  const shortAnswer = isVaShortAnswer(question);
  if (shortAnswer && input.answer.trim().length === 0)
    throw new HttpsError('invalid-argument', 'Type an answer first.');
  // A short answer has no key: it is saved for the teacher to mark, never right or wrong here.
  const result = (answer: string): CheckVideoActivityAnswerResult => ({
    isCorrect:
      withholdResult || shortAnswer ? null : gradeVaAnswer(question, answer),
    correctAnswer:
      withholdKey || shortAnswer ? '' : (question.correctAnswer ?? ''),
  });
  if (!isStudent) return result(input.answer);
  if (isPeriodFrozen(session, responseDoc.data(), nowMs))
    throw new HttpsError(
      'failed-precondition',
      "Your class period isn't open right now."
    );
  if (isLive && !isLiveQuestionOpen(session, question.id))
    throw new HttpsError('failed-precondition', 'Question closed.', {
      reason: QUESTION_CLOSED_REASON,
    });
  if (
    !isLive &&
    settings.allowSkipping !== true &&
    !allEarlierAnswered(questions, question, responseDoc.data().answers)
  )
    throw new HttpsError(
      'failed-precondition',
      'Answer the earlier questions first.'
    );
  const closeAt: unknown = session.closeAt;
  // A finished or closed response takes no new answer, so it gets no verdict either.
  const shut = (data: Record<string, unknown>) =>
    data.completedAt != null ||
    (typeof closeAt === 'number' &&
      nowMs > closeAt + CLOSE_GRACE_MS &&
      data.unlocked !== true);
  // Require-correct mode only ever records correct answers, so revealing the key can't change a score.
  if (!isLive && rules.requireCorrectAnswer)
    return shut(responseDoc.data()) ? NO_VERDICT : result(input.answer);
  // Otherwise the checked answer is the graded one: record it first, so probing spends the attempt.
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(responseDoc.ref);
    const data = snap.data() ?? {};
    const recorded = serverRecordedAnswer(data, question.id);
    if (recorded !== null) return result(recorded);
    const answers = answerList(data);
    // Only an answer this callable recorded is ever graded for a student.
    if (answers.some((a) => a?.questionId === question.id) || shut(data))
      return NO_VERDICT;
    tx.update(responseDoc.ref, {
      answers: [
        ...answers,
        {
          questionId: question.id,
          answer: input.answer,
          answeredAt: nowMs,
          // The student can read their own response, so a hidden verdict stays off it until Publish re-grades.
          ...(withholdResult || shortAnswer
            ? {}
            : { isCorrect: gradeVaAnswer(question, input.answer) }),
        },
      ],
      [CHECKED_ANSWERS_FIELD]: {
        ...asRecord(data[CHECKED_ANSWERS_FIELD]),
        [question.id]: { answer: input.answer, attempt: attemptOf(data) },
      },
    });
    return result(input.answer);
  });
}

/** Once the board reveals a live question, stamps each response's verdict for it. */
export async function stampRevealedVerdicts(
  db: admin.firestore.Firestore,
  sessionId: string,
  after: Record<string, unknown> | null,
  before: Record<string, unknown> | null = null
): Promise<number> {
  const live = asRecord(after?.live);
  const questionId = live.currentQuestionId;
  if (
    !after ||
    after.sessionMode !== 'teacher' ||
    live.answerRevealed !== true ||
    typeof questionId !== 'string'
  )
    return 0;
  const prev = asRecord(before?.live);
  if (prev.answerRevealed === true && prev.currentQuestionId === questionId)
    return 0;
  const [keySnap, responses] = await Promise.all([
    keyRef(db, sessionId).get(),
    db.collection(SESSIONS).doc(sessionId).collection('responses').get(),
  ]);
  const question = sessionKeyQuestions(keySnap, after).find(
    (q) => q.id === questionId
  );
  if (!question || isVaShortAnswer(question)) return 0;
  const stamped = await Promise.all(
    responses.docs.map((doc) =>
      db.runTransaction(async (tx) => {
        const snap = await tx.get(doc.ref);
        const answers = [...answerList(snap.data() ?? {})];
        const i = answers.findIndex((a) => a?.questionId === questionId);
        if (i < 0) return false;
        const entry = answers[i];
        const isCorrect = gradeVaAnswer(
          question,
          typeof entry.answer === 'string' ? entry.answer : ''
        );
        if (entry.isCorrect === isCorrect) return false;
        answers[i] = { ...entry, isCorrect };
        tx.update(doc.ref, { answers });
        return true;
      })
    )
  );
  return stamped.filter(Boolean).length;
}

export const checkVideoActivityAnswerV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  (request) => {
    assertViewAsAllowed(request);
    return handleCheckVideoActivityAnswer(
      admin.firestore(),
      request.auth?.uid ?? null,
      request.data
    );
  }
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
    const afterData = after.exists ? (after.data() ?? {}) : null;
    const beforeData = before.exists ? (before.data() ?? {}) : null;
    const db = admin.firestore();
    const [result] = await Promise.all([
      scrubVideoActivitySessionKey(db, sessionId, afterData, beforeData),
      stampRevealedVerdicts(db, sessionId, afterData, beforeData),
    ]);
    if (result === 'scrubbed')
      logger.info('scrubVideoActivitySessionKeyV1: moved embedded key', {
        sessionId,
      });
  }
);

// Re-scores submitted Write and Test Checks after the teacher fixes the set's cards.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';
import {
  checkGrader,
  sessionCards,
  type FlashcardCard,
} from './flashcardCheck';

export const CHECK_SYNC_FEATURE_ID = 'flashcards-check-sync';
const MAX_ID_LENGTH = 128;
const WRITE_CHUNK = 50;

export interface RescoreCaller {
  uid: string;
  email: string | null;
  studentRole: boolean;
}

interface StoredAnswer extends Record<string, unknown> {
  cardId: string;
  response: string;
  type?: unknown;
  correct?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAnswer = (entry: unknown): entry is StoredAnswer =>
  isRecord(entry) &&
  typeof entry.cardId === 'string' &&
  typeof entry.response === 'string';

/** One submission re-graded against `cards`; null when nothing changes. */
export function rescoredSubmission(
  progress: Record<string, unknown>,
  cards: FlashcardCard[],
  grader: ReturnType<typeof checkGrader>
): { answerLog: StoredAnswer[]; score: number } | null {
  if (typeof progress.submittedAt !== 'number') return null;
  if (!Array.isArray(progress.answerLog)) return null;
  const byId = new Map(cards.map((card) => [card.id, card]));
  let changed = false;
  const answerLog = progress.answerLog.map((entry: unknown) => {
    if (!isAnswer(entry)) return entry as StoredAnswer;
    const card = byId.get(entry.cardId);
    // Blank answers were left unanswered (forced submit); Speak verdicts come from the device.
    if (!card || entry.response === '' || entry.type === 'speak') return entry;
    // A card with no answer left to grade against keeps its verdict.
    if (grader.answerFor(card).trim() === '') return entry;
    // A picked choice keeps its verdict: the student chose the keyed answer they were shown.
    const correct =
      entry.type === 'mc'
        ? entry.correct === true || entry.response === grader.answerFor(card)
        : grader.typedCorrect(entry.response, card);
    if (correct === entry.correct) return entry;
    changed = true;
    return { ...entry, correct };
  });
  if (!changed) return null;
  const accepted = new Set(
    (Array.isArray(progress.flags) ? progress.flags : [])
      .filter((flag): flag is Record<string, unknown> => isRecord(flag))
      .filter((flag) => flag.accepted === true)
      .map((flag) => flag.cardId)
  );
  const score = answerLog.filter(
    (entry) =>
      isAnswer(entry) && (entry.correct === true || accepted.has(entry.cardId))
  ).length;
  return { answerLog, score };
}

export async function handleRescoreFlashcardCheck(
  db: admin.firestore.Firestore,
  caller: RescoreCaller | null,
  rawInput: unknown
): Promise<{ rescored: number }> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (caller.studentRole)
    throw new HttpsError('permission-denied', 'Teacher sign-in required.');
  const assignmentId = isRecord(rawInput) ? rawInput.assignmentId : undefined;
  if (
    typeof assignmentId !== 'string' ||
    assignmentId.length === 0 ||
    assignmentId.length > MAX_ID_LENGTH ||
    assignmentId.includes('/')
  )
    throw new HttpsError('invalid-argument', 'assignmentId is required.');

  const sessionRef = db.collection('flashcard_sessions').doc(assignmentId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists)
    throw new HttpsError('not-found', 'Assignment not found.');
  const session: Record<string, unknown> = sessionSnap.data() ?? {};
  if (session.teacherUid !== caller.uid)
    throw new HttpsError('permission-denied', 'Not your assignment.');
  if (session.kind !== 'check' || session.status !== 'active')
    throw new HttpsError('failed-precondition', 'Not an open Check.');
  if (session.checkMode !== 'write' && session.checkMode !== 'test')
    return { rescored: 0 };
  const { isGlobalFeatureGranted } = await import('./quizMediaArchive');
  if (
    !(await isGlobalFeatureGranted(
      db,
      CHECK_SYNC_FEATURE_ID,
      caller.email,
      caller.uid
    ))
  )
    throw new HttpsError('permission-denied', 'Not turned on.');

  const cards = sessionCards(
    session.cardsInContent === true
      ? (await sessionRef.collection('content').doc('cards').get()).get('cards')
      : session.cards
  );
  const grader = checkGrader(session);
  const submitted = await sessionRef
    .collection('progress')
    .where('submittedAt', '>', 0)
    .get();
  const writes = submitted.docs.flatMap((progressDoc) => {
    const next = rescoredSubmission(progressDoc.data(), cards, grader);
    // Guarded on the read, so a reopen or a student's write since then is never overwritten.
    return next
      ? [
          () =>
            progressDoc.ref.update(next, {
              lastUpdateTime: progressDoc.updateTime,
            }),
        ]
      : [];
  });
  let rescored = 0;
  for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
    const results = await Promise.allSettled(
      writes.slice(i, i + WRITE_CHUNK).map((write) => write())
    );
    rescored += results.filter((r) => r.status === 'fulfilled').length;
  }
  return { rescored };
}

export const rescoreFlashcardCheckV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    await assertViewAsAllowed(request);
    return handleRescoreFlashcardCheck(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            email:
              typeof request.auth.token.email === 'string'
                ? request.auth.token.email
                : null,
            studentRole: request.auth.token.studentRole === true,
          }
        : null,
      request.data
    );
  }
);

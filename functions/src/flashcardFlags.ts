// Teacher review of Flashcards Check flags (docs/plans/shipped/FLASHCARDS.md §2.6 Q41, §7).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';

const MAX_ID_LENGTH = 128;

interface StoredAnswer {
  cardId: string;
  correct?: boolean;
}

interface StoredFlag {
  cardId: string;
  response: string;
  accepted?: boolean;
}

export interface ResolveFlashcardFlagInput {
  assignmentId: string;
  studentUid: string;
  cardId: string;
  accept: boolean;
}

export interface FlashcardFlagCaller {
  uid: string;
  studentRole: boolean;
}

export interface ResolveFlashcardFlagResult {
  score: number;
  total: number;
}

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseId = (value: unknown, field: string): string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH &&
  !value.includes('/')
    ? value
    : invalid(`${field} is required.`);

export function parseResolveFlashcardFlagInput(
  raw: unknown
): ResolveFlashcardFlagInput {
  const data = isRecord(raw) ? raw : {};
  if (typeof data.accept !== 'boolean') invalid('accept must be a boolean.');
  return {
    assignmentId: parseId(data.assignmentId, 'assignmentId'),
    studentUid: parseId(data.studentUid, 'studentUid'),
    cardId: parseId(data.cardId, 'cardId'),
    accept: data.accept,
  };
}

const storedAnswers = (raw: unknown): StoredAnswer[] =>
  Array.isArray(raw)
    ? raw.filter(
        (entry): entry is StoredAnswer =>
          isRecord(entry) && typeof entry.cardId === 'string'
      )
    : [];

const storedFlags = (raw: unknown): StoredFlag[] =>
  Array.isArray(raw)
    ? raw.filter(
        (flag): flag is StoredFlag =>
          isRecord(flag) &&
          typeof flag.cardId === 'string' &&
          typeof flag.response === 'string'
      )
    : [];

export async function handleResolveFlashcardFlag(
  db: admin.firestore.Firestore,
  caller: FlashcardFlagCaller | null,
  rawInput: unknown
): Promise<ResolveFlashcardFlagResult> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (caller.studentRole)
    throw new HttpsError('permission-denied', 'Teacher sign-in required.');
  const input = parseResolveFlashcardFlagInput(rawInput);

  const sessionRef = db
    .collection('flashcard_sessions')
    .doc(input.assignmentId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists)
    throw new HttpsError('not-found', 'Assignment not found.');
  const session: Record<string, unknown> = sessionSnap.data() ?? {};
  if (session.teacherUid !== caller.uid)
    throw new HttpsError('permission-denied', 'Not your assignment.');
  if (session.kind !== 'check')
    throw new HttpsError('failed-precondition', 'Not a Check assignment.');

  const progressRef = sessionRef.collection('progress').doc(input.studentUid);
  return db.runTransaction(async (tx) => {
    const progressSnap = await tx.get(progressRef);
    if (!progressSnap.exists)
      throw new HttpsError('not-found', 'No submission for that student.');
    const progress: Record<string, unknown> = progressSnap.data() ?? {};
    if (typeof progress.submittedAt !== 'number')
      throw new HttpsError('failed-precondition', 'Nothing submitted yet.');

    const flags = storedFlags(progress.flags);
    const target = flags.find((flag) => flag.cardId === input.cardId);
    if (!target) throw new HttpsError('not-found', 'No flag for that card.');
    const nextFlags = flags.map((flag) =>
      flag.cardId === input.cardId ? { ...flag, accepted: input.accept } : flag
    );

    const accepted = new Set(
      nextFlags.filter((flag) => flag.accepted === true).map((f) => f.cardId)
    );
    const answerLog = storedAnswers(progress.answerLog);
    const score = answerLog.filter(
      (entry) => entry.correct === true || accepted.has(entry.cardId)
    ).length;
    const total =
      typeof progress.total === 'number' ? progress.total : answerLog.length;

    tx.set(progressRef, { flags: nextFlags, score }, { merge: true });
    return { score, total };
  });
}

export const resolveFlashcardFlagV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  (request) =>
    handleResolveFlashcardFlag(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            studentRole: request.auth.token.studentRole === true,
          }
        : null,
      request.data
    )
);

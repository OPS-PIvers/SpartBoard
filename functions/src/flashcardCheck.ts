// Server grading for Flashcards Check submissions (docs/plans/FLASHCARDS.md §2.6, §7).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { matchFlashcardAnswer } from './flashcardMatch';

// Local mirrors of the root types.ts shapes; functions cannot import root code.
type FlashcardMode = 'flashcards' | 'write' | 'test';
type FlashcardTestType = 'mc' | 'fib';

interface FlashcardCard {
  id: string;
  term: string;
  definition: string;
}

interface LockedSettings {
  showFirst: 'term' | 'definition';
  strict: boolean;
  testTypes: FlashcardTestType[];
  testCount: number | 'all';
}

interface RawAnswer {
  cardId: string;
  response: string;
  type?: FlashcardTestType;
  attempts?: number;
}

interface GradedAnswer extends RawAnswer {
  correct: boolean;
}

interface RawFlag {
  cardId: string;
  response: string;
}

export interface SubmitFlashcardCheckInput {
  assignmentId: string;
  answerLog: RawAnswer[];
  flags: RawFlag[];
}

export interface FlashcardCheckCaller {
  uid: string;
  studentRole: boolean;
  classIds: string[];
}

export interface SubmitFlashcardCheckResult {
  score: number;
  total: number;
  submittedAt: number;
}

export const WINDOW_GRACE_MS = 120_000;
const MAX_ID_LENGTH = 128;
const MAX_LOG_ENTRIES = 600;
const MAX_RESPONSE_LENGTH = 2000;
const MAX_ATTEMPTS = 1000;
const DEFAULT_MASTERY_THRESHOLD = 3;
const TEST_TYPES: readonly FlashcardTestType[] = ['mc', 'fib'];
const MC_MIN_CARDS = 4;

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isTestType = (value: unknown): value is FlashcardTestType =>
  TEST_TYPES.includes(value as FlashcardTestType);

const parseCardId = (value: unknown): string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
    ? value
    : invalid('Each entry needs a cardId.');

const parseResponse = (value: unknown): string =>
  typeof value === 'string' && value.length <= MAX_RESPONSE_LENGTH
    ? value
    : invalid('Each response must be a string of at most 2000 characters.');

export function parseSubmitFlashcardCheckInput(
  raw: unknown
): SubmitFlashcardCheckInput {
  const data = isRecord(raw) ? raw : {};
  const assignmentId = data.assignmentId;
  if (
    typeof assignmentId !== 'string' ||
    assignmentId.length === 0 ||
    assignmentId.length > MAX_ID_LENGTH ||
    assignmentId.includes('/')
  )
    invalid('assignmentId is required.');
  if (!Array.isArray(data.answerLog) || data.answerLog.length > MAX_LOG_ENTRIES)
    invalid('answerLog must be an array of at most 600 entries.');
  const answerLog = (data.answerLog as unknown[]).map((entry): RawAnswer => {
    if (!isRecord(entry)) return invalid('Malformed answerLog entry.');
    const parsed: RawAnswer = {
      cardId: parseCardId(entry.cardId),
      response: parseResponse(entry.response),
    };
    if (entry.type !== undefined) {
      if (!isTestType(entry.type)) invalid('Unknown answer type.');
      parsed.type = entry.type;
    }
    if (isFiniteNumber(entry.attempts)) parsed.attempts = entry.attempts;
    return parsed;
  });
  const rawFlags = data.flags ?? [];
  if (!Array.isArray(rawFlags) || rawFlags.length > MAX_LOG_ENTRIES)
    invalid('flags must be an array of at most 600 entries.');
  const flags = (rawFlags as unknown[]).map((flag): RawFlag => {
    if (!isRecord(flag)) return invalid('Malformed flag.');
    return {
      cardId: parseCardId(flag.cardId),
      response: parseResponse(flag.response),
    };
  });
  return { assignmentId, answerLog, flags };
}

function sessionCards(raw: unknown): FlashcardCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (card): card is FlashcardCard =>
      isRecord(card) &&
      typeof card.id === 'string' &&
      typeof card.term === 'string' &&
      typeof card.definition === 'string'
  );
}

function lockedSettingsFrom(raw: unknown): LockedSettings {
  const data = isRecord(raw) ? raw : {};
  const testTypes = Array.isArray(data.testTypes)
    ? TEST_TYPES.filter((type) => (data.testTypes as unknown[]).includes(type))
    : [];
  return {
    showFirst: data.showFirst === 'definition' ? 'definition' : 'term',
    strict: data.strict === true,
    testTypes: testTypes.length > 0 ? testTypes : [...TEST_TYPES],
    testCount:
      isFiniteNumber(data.testCount) && data.testCount >= 1
        ? Math.floor(data.testCount)
        : 'all',
  };
}

function sessionClassIds(session: Record<string, unknown>): string[] {
  const ids = Array.isArray(session.classIds)
    ? session.classIds.filter((c): c is string => typeof c === 'string')
    : [];
  if (typeof session.classId === 'string' && !ids.includes(session.classId))
    ids.push(session.classId);
  return ids;
}

const windowField = (
  pointer: Record<string, unknown>,
  session: Record<string, unknown>,
  field: 'openAt' | 'closeAt'
): number | null => {
  const pointerValue = pointer[field];
  if (isFiniteNumber(pointerValue)) return pointerValue;
  const sessionValue = session[field];
  return isFiniteNumber(sessionValue) ? sessionValue : null;
};

const clampAttempts = (value: number | undefined): number =>
  value === undefined
    ? 1
    : Math.min(MAX_ATTEMPTS, Math.max(1, Math.trunc(value)));

// Rejects duplicate or unknown card ids and returns the matching session cards.
function cardsForLog(
  answerLog: RawAnswer[],
  byId: Map<string, FlashcardCard>
): FlashcardCard[] {
  const seen = new Set<string>();
  return answerLog.map((entry) => {
    const card = byId.get(entry.cardId);
    if (!card) return invalid('answerLog references an unknown card.');
    if (seen.has(entry.cardId)) invalid('answerLog repeats a card.');
    seen.add(entry.cardId);
    return card;
  });
}

export async function handleSubmitFlashcardCheck(
  db: admin.firestore.Firestore,
  caller: FlashcardCheckCaller | null,
  rawInput: unknown,
  nowMs: number
): Promise<SubmitFlashcardCheckResult> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!caller.studentRole)
    throw new HttpsError('permission-denied', 'Student sign-in required.');
  const input = parseSubmitFlashcardCheckInput(rawInput);

  const sessionRef = db
    .collection('flashcard_sessions')
    .doc(input.assignmentId);
  const pointerRef = db
    .collection('student_assignments')
    .doc(caller.uid)
    .collection('items')
    .doc(input.assignmentId);
  const [sessionSnap, pointerSnap] = await Promise.all([
    sessionRef.get(),
    pointerRef.get(),
  ]);
  if (!sessionSnap.exists)
    throw new HttpsError('not-found', 'Assignment not found.');
  const session: Record<string, unknown> = sessionSnap.data() ?? {};
  const pointer: Record<string, unknown> = pointerSnap.exists
    ? (pointerSnap.data() ?? {})
    : {};

  if (pointer.excluded === true)
    throw new HttpsError('permission-denied', 'Not assigned to this student.');
  const classIds = sessionClassIds(session);
  const sharedClassId = caller.classIds.find((c) => classIds.includes(c));
  if (!pointerSnap.exists && sharedClassId === undefined)
    throw new HttpsError('permission-denied', 'Not assigned to this student.');

  if (session.kind !== 'check')
    throw new HttpsError('failed-precondition', 'Not a Check assignment.');
  if (session.status === 'ended')
    throw new HttpsError('failed-precondition', 'This assignment has ended.');
  const openAt = windowField(pointer, session, 'openAt');
  const closeAt = windowField(pointer, session, 'closeAt');
  if (closeAt !== null && nowMs > closeAt + WINDOW_GRACE_MS)
    throw new HttpsError('failed-precondition', 'This assignment is closed.');
  if (openAt !== null && nowMs < openAt - WINDOW_GRACE_MS)
    throw new HttpsError('failed-precondition', 'This assignment is not open.');

  const checkMode = session.checkMode as FlashcardMode | undefined;
  if (
    checkMode !== 'flashcards' &&
    checkMode !== 'write' &&
    checkMode !== 'test'
  )
    throw new HttpsError('failed-precondition', 'Unknown Check mode.');
  const cards = sessionCards(session.cards);
  if (cards.length === 0)
    throw new HttpsError(
      'failed-precondition',
      'This assignment has no cards.'
    );
  const byId = new Map(cards.map((card) => [card.id, card]));
  const settings = lockedSettingsFrom(session.lockedSettings);
  const answerFor = (card: FlashcardCard): string =>
    settings.showFirst === 'term' ? card.definition : card.term;
  const rawLanguage =
    settings.showFirst === 'term'
      ? session.definitionLanguage
      : session.termLanguage;
  const language = typeof rawLanguage === 'string' ? rawLanguage : '';
  const typedCorrect = (response: string, card: FlashcardCard): boolean =>
    matchFlashcardAnswer(response, answerFor(card), {
      language,
      strict: settings.strict,
    }).result !== 'wrong';

  // Validation that does not depend on stored progress runs before the transaction.
  let graded: GradedAnswer[] = [];
  let total = cards.length;
  if (checkMode === 'write') {
    if (input.answerLog.length !== cards.length)
      invalid('answerLog must include every card once.');
    const logCards = cardsForLog(input.answerLog, byId);
    graded = input.answerLog.map((entry, i) => ({
      cardId: entry.cardId,
      response: entry.response,
      attempts: clampAttempts(entry.attempts),
      correct: typedCorrect(entry.response, logCards[i]),
    }));
  } else if (checkMode === 'test') {
    total =
      settings.testCount === 'all'
        ? cards.length
        : Math.min(settings.testCount, cards.length);
    if (input.answerLog.length !== total)
      invalid('answerLog does not match the locked question count.');
    const logCards = cardsForLog(input.answerLog, byId);
    graded = input.answerLog.map((entry, i) => {
      const type = entry.type;
      if (type === undefined || !settings.testTypes.includes(type))
        return invalid('answerLog uses a question type that is not allowed.');
      if (type === 'mc' && cards.length < MC_MIN_CARDS)
        invalid('Multiple choice needs at least four cards.');
      const card = logCards[i];
      return {
        cardId: entry.cardId,
        response: entry.response,
        type,
        correct:
          type === 'mc'
            ? entry.response === answerFor(card)
            : typedCorrect(entry.response, card),
      };
    });
  }
  const gradedIds = new Set(graded.map((entry) => entry.cardId));
  const flagged = new Set<string>();
  const flags = input.flags.filter((flag) => {
    if (!gradedIds.has(flag.cardId) || flagged.has(flag.cardId)) return false;
    flagged.add(flag.cardId);
    return true;
  });

  const progressRef = sessionRef.collection('progress').doc(caller.uid);
  return db.runTransaction(async (tx) => {
    const progressSnap = await tx.get(progressRef);
    const progress: Record<string, unknown> = progressSnap.exists
      ? (progressSnap.data() ?? {})
      : {};
    if (isFiniteNumber(progress.submittedAt))
      throw new HttpsError('already-exists', 'Already submitted.');

    let score: number;
    if (checkMode === 'flashcards') {
      const threshold = isFiniteNumber(session.masteryThreshold)
        ? session.masteryThreshold
        : DEFAULT_MASTERY_THRESHOLD;
      const progressCards = isRecord(progress.cards) ? progress.cards : {};
      const allMastered = cards.every((card) => {
        const entry = progressCards[card.id];
        return (
          isRecord(entry) && isFiniteNumber(entry.s) && entry.s >= threshold
        );
      });
      if (!allMastered)
        throw new HttpsError(
          'failed-precondition',
          'Every card must reach the mastery threshold first.'
        );
      score = cards.length;
    } else {
      score = graded.filter((entry) => entry.correct).length;
    }

    const write: Record<string, unknown> = {
      score,
      total,
      answerLog: graded,
      flags,
      submittedAt: nowMs,
      lastActiveAt: nowMs,
    };
    if (!progressSnap.exists) {
      Object.assign(write, {
        classId:
          typeof pointer.classId === 'string'
            ? pointer.classId
            : (sharedClassId ?? ''),
        cards: {},
        starred: [],
        round: 1,
        studyMs: 0,
        modesUsed: [checkMode],
        tests: [],
      });
    }
    tx.set(progressRef, write, { merge: true });
    return { score, total, submittedAt: nowMs };
  });
}

export const submitFlashcardCheckV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  (request) =>
    handleSubmitFlashcardCheck(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            studentRole: request.auth.token.studentRole === true,
            classIds: claimClassIds(request.auth.token.classIds),
          }
        : null,
      request.data,
      Date.now()
    )
);

function claimClassIds(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];
}

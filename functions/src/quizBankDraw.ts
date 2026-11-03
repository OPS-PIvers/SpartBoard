// Draws and records a bank-slot quiz attempt's questions on the server, so a student never chooses their own served list.
import { randomInt } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS, encodeResponseKeySegment } from './classlinkShared';
import { withQuizSessionContent } from './quizSessionContent';
import { assertViewAsAllowed } from './viewAsGuard';

const SESSIONS = 'quiz_sessions';
const MAX_ID_LENGTH = 200;
/** Mirrors BANK_DEALS_COLLECTION and DEALT_HISTORY_CAP in utils/quizBalancedDeal.ts. */
export const BANK_DEALS_COLLECTION = 'bank_deals';
export const DEALT_HISTORY_CAP = 150;

export interface BankSlot {
  id: string;
  count: number;
  points: number;
  poolQuestionIds: string[];
  position: number;
  dealing?: 'balanced';
}

export type RandomIndex = (n: number) => number;

const secureIndex: RandomIndex = (n) => (n <= 1 ? 0 : randomInt(n));

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

/** The session's frozen slots; malformed entries are dropped. */
export function parseBankSlots(raw: unknown): BankSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: BankSlot[] = [];
  for (const entry of raw) {
    const r = asRecord(entry);
    if (!isId(r.id)) continue;
    const count = typeof r.count === 'number' ? Math.floor(r.count) : 0;
    out.push({
      id: r.id,
      count: Math.max(0, count),
      points: typeof r.points === 'number' ? r.points : 1,
      poolQuestionIds: asStringList(r.poolQuestionIds),
      position: typeof r.position === 'number' ? Math.floor(r.position) : 0,
      ...(r.dealing === 'balanced' ? { dealing: 'balanced' as const } : {}),
    });
  }
  return out;
}

/** Mirrors secureShuffle in utils/questionBanks.ts. */
export function secureShuffle<T>(
  items: readonly T[],
  randomIndex: RandomIndex = secureIndex
): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Mirrors drawServedQuestionIds in utils/questionBanks.ts. */
export function drawServedQuestionIds(
  publicQuestionIds: readonly string[],
  slots: readonly BankSlot[],
  randomIndex: RandomIndex = secureIndex,
  dealtBySlot?: ReadonlyMap<string, readonly string[]>
): string[] {
  const pooled = new Set(slots.flatMap((s) => s.poolQuestionIds));
  const fixed = publicQuestionIds.filter((id) => !pooled.has(id));
  const bySlotPosition = new Map<number, string[]>();
  for (const slot of slots) {
    const dealt = dealtBySlot?.get(slot.id);
    const drawn = dealt
      ? [...dealt]
      : secureShuffle(slot.poolQuestionIds, randomIndex).slice(0, slot.count);
    const at = Math.min(Math.max(slot.position, 0), fixed.length);
    bySlotPosition.set(at, [...(bySlotPosition.get(at) ?? []), ...drawn]);
  }
  const out: string[] = [];
  for (let i = 0; i <= fixed.length; i++) {
    const inserted = bySlotPosition.get(i);
    if (inserted) out.push(...inserted);
    if (i < fixed.length) out.push(fixed[i]);
  }
  return out;
}

/** Mirrors isValidDraw in utils/questionBanks.ts. */
export function isValidDraw(
  publicQuestionIds: readonly string[],
  slots: readonly BankSlot[],
  servedIds: readonly string[]
): boolean {
  const pooled = new Set(slots.flatMap((s) => s.poolQuestionIds));
  const fixed = publicQuestionIds.filter((id) => !pooled.has(id));
  const served = new Set(servedIds);
  if (served.size !== servedIds.length) return false;
  if (!fixed.every((id) => served.has(id))) return false;
  let expected = fixed.length;
  for (const slot of slots) {
    const pool = new Set(slot.poolQuestionIds);
    const hits = servedIds.filter((id) => pool.has(id)).length;
    if (hits !== slot.count) return false;
    expected += slot.count;
  }
  return servedIds.length === expected;
}

/** Mirrors isBalancedSlot in utils/quizBalancedDeal.ts. */
export function isBalancedSlot(slot: BankSlot): boolean {
  return (
    slot.dealing === 'balanced' &&
    slot.count > 0 &&
    slot.poolQuestionIds.length > 0
  );
}

/** Mirrors balancedPeriodKey in utils/quizBalancedDeal.ts. */
export function balancedPeriodKey(response: Record<string, unknown>): string {
  const period =
    typeof response.classPeriod === 'string'
      ? response.classPeriod
      : typeof response.classId === 'string'
        ? response.classId
        : undefined;
  return encodeResponseKeySegment(period);
}

export function bankDealDocId(slotId: string, periodKey: string): string {
  return `${slotId}__${periodKey}`;
}

/** Mirrors dealFromRotation in utils/quizBalancedDeal.ts. */
export function dealFromRotation(
  pool: readonly string[],
  count: number,
  dealt: number,
  seen: ReadonlySet<string>
): string[] {
  const n = pool.length;
  if (n === 0 || count < 1) return [];
  const start = (((Math.max(0, dealt) * count) % n) + n) % n;
  const turn = Array.from({ length: n }, (_, i) => pool[(start + i) % n]);
  const unseen = turn.filter((id) => !seen.has(id));
  const fill = turn.filter((id) => seen.has(id));
  return [...unseen, ...fill].slice(0, Math.min(count, n));
}

export interface BalancedDealPlan {
  ids: string[];
  counters: { slotId: string; dealt: number }[];
  history: string[];
}

/** Mirrors planBalancedDeal in utils/quizBalancedDeal.ts; null when the response already holds a valid draw. */
export function planBalancedDeal(
  publicQuestionIds: readonly string[],
  slots: readonly BankSlot[],
  response: { servedQuestionIds?: string[]; dealtQuestionIds?: string[] },
  dealtCounts: ReadonlyMap<string, number>,
  randomIndex: RandomIndex = secureIndex
): BalancedDealPlan | null {
  const existing = response.servedQuestionIds;
  if (
    existing &&
    existing.length > 0 &&
    isValidDraw(publicQuestionIds, slots, existing)
  ) {
    return null;
  }
  const history = [...(response.dealtQuestionIds ?? [])];
  const seen = new Set(history);
  const dealtBySlot = new Map<string, string[]>();
  const counters: BalancedDealPlan['counters'] = [];
  for (const slot of slots) {
    if (!isBalancedSlot(slot)) continue;
    const dealt = dealtCounts.get(slot.id) ?? 0;
    const ids = dealFromRotation(slot.poolQuestionIds, slot.count, dealt, seen);
    dealtBySlot.set(slot.id, ids);
    counters.push({ slotId: slot.id, dealt: dealt + 1 });
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        history.push(id);
      }
    }
  }
  const ids = drawServedQuestionIds(
    publicQuestionIds,
    slots,
    randomIndex,
    dealtBySlot
  );
  return { ids, counters, history: history.slice(-DEALT_HISTORY_CAP) };
}

export interface DrawQuizBankQuestionsInput {
  sessionId: string;
  responseKey: string;
}

export interface DrawQuizBankQuestionsResult {
  servedQuestionIds: string[];
}

export function parseDrawInput(raw: unknown): DrawQuizBankQuestionsInput {
  const data = asRecord(raw);
  if (!isId(data.sessionId) || !isId(data.responseKey))
    throw new HttpsError(
      'invalid-argument',
      'sessionId and responseKey are required.'
    );
  return { sessionId: data.sessionId, responseKey: data.responseKey };
}

export async function handleDrawQuizBankQuestions(
  db: admin.firestore.Firestore,
  callerUid: string | null,
  rawInput: unknown,
  randomIndex: RandomIndex = secureIndex
): Promise<DrawQuizBankQuestionsResult> {
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const input = parseDrawInput(rawInput);
  const sessionRef = db.collection(SESSIONS).doc(input.sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new HttpsError('not-found', 'Quiz not found.');
  const session = await withQuizSessionContent(
    sessionRef,
    sessionSnap.data() ?? {}
  );
  const slots = parseBankSlots(session.bankSlots);
  if (slots.length === 0)
    throw new HttpsError(
      'failed-precondition',
      'This quiz has no question bank slots.'
    );
  if ((session.mode ?? 'submissions') !== 'submissions')
    throw new HttpsError('failed-precondition', 'This quiz is view only.');
  const publicQuestionIds = (
    Array.isArray(session.publicQuestions)
      ? (session.publicQuestions as unknown[])
      : []
  )
    .map((q) => asRecord(q).id)
    .filter(isId);
  const responseRef = sessionRef.collection('responses').doc(input.responseKey);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(responseRef);
    if (!snap.exists)
      throw new HttpsError('permission-denied', 'Join the quiz first.');
    const response = snap.data() ?? {};
    if (response.studentUid !== callerUid)
      throw new HttpsError('permission-denied', 'Not your response.');
    const existing = asStringList(response.servedQuestionIds);
    if (existing.length > 0 && isValidDraw(publicQuestionIds, slots, existing))
      return { servedQuestionIds: existing };
    // A turned-in attempt keeps what it was served; only a teacher unlock or a retake draws again.
    if (response.status === 'completed' && response.unlocked !== true)
      return { servedQuestionIds: existing };

    const balanced = slots.filter(isBalancedSlot);
    const period = balancedPeriodKey(response);
    const counterRefs = balanced.map((slot) =>
      sessionRef
        .collection(BANK_DEALS_COLLECTION)
        .doc(bankDealDocId(slot.id, period))
    );
    const counterSnaps = await Promise.all(
      counterRefs.map((ref) => tx.get(ref))
    );
    const counts = new Map<string, number>();
    balanced.forEach((slot, i) => {
      const raw: unknown = counterSnaps[i].data()?.dealt;
      counts.set(slot.id, typeof raw === 'number' ? raw : 0);
    });
    const plan =
      balanced.length > 0
        ? planBalancedDeal(
            publicQuestionIds,
            slots,
            {
              servedQuestionIds: existing,
              dealtQuestionIds: asStringList(response.dealtQuestionIds),
            },
            counts,
            randomIndex
          )
        : null;
    const ids = plan
      ? plan.ids
      : drawServedQuestionIds(publicQuestionIds, slots, randomIndex);
    if (plan) {
      plan.counters.forEach(({ slotId, dealt }) => {
        const i = balanced.findIndex((s) => s.id === slotId);
        if (i >= 0) tx.set(counterRefs[i], { dealt, by: callerUid });
      });
    }
    tx.update(responseRef, {
      servedQuestionIds: ids,
      ...(plan ? { dealtQuestionIds: plan.history } : {}),
      lastWriteAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { servedQuestionIds: ids };
  });
}

export const drawQuizBankQuestionsV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  (request) => {
    assertViewAsAllowed(request);
    return handleDrawQuizBankQuestions(
      admin.firestore(),
      request.auth?.uid ?? null,
      request.data
    );
  }
);

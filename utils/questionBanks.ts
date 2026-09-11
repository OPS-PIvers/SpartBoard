import {
  QUIZ_ASSIGNMENT_POOL_CAP,
  type QuestionBankData,
  type QuestionBankMetadata,
  type QuestionTargetTag,
  type QuizBankSlot,
  type QuizData,
  type QuizOrderEntry,
  type QuizQuestion,
  type QuizSessionBankSlot,
  type QuizStimulus,
} from '@/types';

/** Content needed to resolve a slot: a personal bank's Drive JSON or a synced doc. */
export type BankContent = Pick<
  QuestionBankData,
  'id' | 'title' | 'questions' | 'stimuli' | 'targets'
>;

/** Key under which a slot's bank content is looked up: the synced group when shared. */
export function bankSlotKey(
  slot: Pick<QuizBankSlot, 'bankId' | 'syncGroupId'>
): string {
  return slot.syncGroupId ?? slot.bankId;
}

/** Union of two tag lists, deduped by id; `undefined` when the result is empty. */
export function mergeTargets(
  own: QuestionTargetTag[] | undefined,
  inherited: QuestionTargetTag[] | undefined
): QuestionTargetTag[] | undefined {
  const seen = new Set<string>();
  const out: QuestionTargetTag[] = [];
  for (const tag of [...(own ?? []), ...(inherited ?? [])]) {
    if (seen.has(tag.id)) continue;
    seen.add(tag.id);
    out.push({ ...tag });
  }
  return out.length > 0 ? out : undefined;
}

/** Tags a bank question carries once the bank's own tags are inherited. */
export function effectiveQuestionTargets(
  question: QuizQuestion,
  bank: Pick<BankContent, 'targets'>
): QuestionTargetTag[] {
  return mergeTargets(question.targets, bank.targets) ?? [];
}

/** `targetIds` and `targetCounts` for bank metadata, so the picker filters without Drive. */
export function bankTargetIndex(
  bank: Pick<BankContent, 'questions' | 'targets'>
): Pick<QuestionBankMetadata, 'targetIds' | 'targetCounts'> {
  const counts: Record<string, number> = {};
  for (const q of bank.questions) {
    for (const tag of effectiveQuestionTargets(q, bank)) {
      counts[tag.id] = (counts[tag.id] ?? 0) + 1;
    }
  }
  return { targetIds: Object.keys(counts).sort(), targetCounts: counts };
}

/** Bank questions matching any id in `targetFilter`; the whole bank when the filter is empty. */
export function eligibleBankQuestions(
  bank: Pick<BankContent, 'questions' | 'targets'>,
  targetFilter?: string[]
): QuizQuestion[] {
  if (!targetFilter || targetFilter.length === 0) return bank.questions;
  const wanted = new Set(targetFilter);
  return bank.questions.filter((q) =>
    effectiveQuestionTargets(q, bank).some((t) => wanted.has(t.id))
  );
}

export interface CopiedBankQuestions {
  questions: QuizQuestion[];
  /** Stimuli referenced by the copies, re-keyed alongside them. */
  stimuli: QuizStimulus[];
}

/**
 * Fresh copies of `questionIds` with new ids, bank tags merged in and any
 * referenced stimuli duplicated under new ids. Used for the selected-mode
 * picker and for "bank → quiz" copies (decision 22).
 */
export function copyBankQuestions(
  bank: BankContent,
  questionIds: readonly string[],
  newId: () => string = () => crypto.randomUUID()
): CopiedBankQuestions {
  const wanted = new Set(questionIds);
  const stimulusIdMap = new Map<string, string>();
  const stimuli: QuizStimulus[] = [];
  const questions: QuizQuestion[] = [];
  for (const q of bank.questions) {
    if (!wanted.has(q.id)) continue;
    const copy: QuizQuestion = { ...q, id: newId() };
    const targets = mergeTargets(q.targets, bank.targets);
    if (targets) copy.targets = targets;
    else delete copy.targets;
    if (q.stimulusIds && q.stimulusIds.length > 0) {
      const mapped: string[] = [];
      for (const sid of q.stimulusIds) {
        const source = bank.stimuli?.find((s) => s.id === sid);
        if (!source) continue;
        let mappedId = stimulusIdMap.get(sid);
        if (!mappedId) {
          mappedId = newId();
          stimulusIdMap.set(sid, mappedId);
          stimuli.push({ ...source, id: mappedId });
        }
        mapped.push(mappedId);
      }
      if (mapped.length > 0) copy.stimulusIds = mapped;
      else delete copy.stimulusIds;
    }
    questions.push(copy);
  }
  return { questions, stimuli };
}

/** Random slots only; selected slots never survive at rest. */
export function randomBankSlots(
  quiz: Pick<QuizData, 'bankSlots'>
): QuizBankSlot[] {
  return (quiz.bankSlots ?? []).filter((s) => s.mode === 'random');
}

export function quizHasBankSlots(quiz: Pick<QuizData, 'bankSlots'>): boolean {
  return randomBankSlots(quiz).length > 0;
}

/**
 * Normalized interleaving of questions and slots. Entries whose id no longer
 * exists are dropped; questions missing from `order` keep array order and
 * slots missing from it go last.
 */
export function quizOrder(
  quiz: Pick<QuizData, 'questions' | 'bankSlots' | 'order'>
): QuizOrderEntry[] {
  const questionIds = new Set(quiz.questions.map((q) => q.id));
  const slotIds = new Set(randomBankSlots(quiz).map((s) => s.id));
  const seen = new Set<string>();
  const out: QuizOrderEntry[] = [];
  for (const entry of quiz.order ?? []) {
    const known =
      entry.kind === 'question'
        ? questionIds.has(entry.id)
        : slotIds.has(entry.id);
    const key = `${entry.kind}:${entry.id}`;
    if (!known || seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: entry.kind, id: entry.id });
  }
  for (const q of quiz.questions) {
    if (!seen.has(`question:${q.id}`)) out.push({ kind: 'question', id: q.id });
  }
  for (const s of randomBankSlots(quiz)) {
    if (!seen.has(`slot:${s.id}`)) out.push({ kind: 'slot', id: s.id });
  }
  return out;
}

/** Sum of fixed-question points plus every random slot's count × points. */
export function quizMaxPointsWithSlots(
  quiz: Pick<QuizData, 'questions' | 'bankSlots'>
): number {
  let total = 0;
  for (const q of quiz.questions) total += q.points ?? 1;
  for (const s of randomBankSlots(quiz))
    total += (s.count ?? 0) * (s.points ?? 1);
  return total;
}

export interface BankSlotProblem {
  slotId: string;
  bankTitle: string;
  message: string;
}

/**
 * Per-slot fix-it problems for the assign modal (decision 25) plus the pool
 * cap (decision 12). `banks` is keyed by `bankSlotKey`; a missing entry means
 * the bank could not be loaded.
 */
export function validateBankSlots(
  quiz: Pick<QuizData, 'questions' | 'bankSlots'>,
  banks: ReadonlyMap<string, BankContent>
): BankSlotProblem[] {
  const problems: BankSlotProblem[] = [];
  let poolTotal = quiz.questions.length;
  for (const slot of randomBankSlots(quiz)) {
    const bank = banks.get(bankSlotKey(slot));
    const count = slot.count ?? 0;
    if (!bank) {
      problems.push({
        slotId: slot.id,
        bankTitle: slot.bankTitle,
        message: `"${slot.bankTitle}" could not be loaded. Re-add the slot from a bank you still have access to.`,
      });
      continue;
    }
    if (count < 1) {
      problems.push({
        slotId: slot.id,
        bankTitle: slot.bankTitle,
        message: `"${slot.bankTitle}" draws 0 questions. Set how many to draw or remove the slot.`,
      });
      continue;
    }
    const eligible = eligibleBankQuestions(bank, slot.targetFilter).length;
    if (eligible < count) {
      const filtered = slot.targetFilter && slot.targetFilter.length > 0;
      problems.push({
        slotId: slot.id,
        bankTitle: slot.bankTitle,
        message: filtered
          ? `"${slot.bankTitle}" has ${eligible} question${eligible === 1 ? '' : 's'} matching the target filter but the slot draws ${count}. Lower the count, widen the filter, or tag more questions.`
          : `"${slot.bankTitle}" has ${eligible} question${eligible === 1 ? '' : 's'} but the slot draws ${count}. Lower the count or add questions to the bank.`,
      });
    }
    poolTotal += eligible;
  }
  if (poolTotal > QUIZ_ASSIGNMENT_POOL_CAP) {
    problems.push({
      slotId: '',
      bankTitle: '',
      message: `This assignment would carry ${poolTotal} questions (fixed plus every eligible bank question). The limit is ${QUIZ_ASSIGNMENT_POOL_CAP}; narrow a slot's target filter or use a smaller bank.`,
    });
  }
  return problems;
}

export class BankSlotResolutionError extends Error {
  readonly problems: BankSlotProblem[];
  constructor(problems: BankSlotProblem[]) {
    super(problems.map((p) => p.message).join('\n'));
    this.name = 'BankSlotResolutionError';
    this.problems = problems;
  }
}

export interface ResolvedQuizAssignment {
  /** Fixed questions plus every eligible pool question, in serving order; slot points applied. */
  questions: QuizQuestion[];
  stimuli: QuizStimulus[];
  sessionSlots: QuizSessionBankSlot[];
  /** Fixed count plus Σ slot count — what one attempt serves. */
  totalQuestions: number;
}

/**
 * Freeze a quiz's slots into an assignment pool (decision 2, 11). Pool
 * questions keep their bank ids (stable per assignment), take the slot's
 * points, and merge the bank's tags. Throws `BankSlotResolutionError` when
 * `validateBankSlots` reports anything.
 */
export function resolveQuizAssignment(
  quiz: Pick<QuizData, 'questions' | 'stimuli' | 'bankSlots' | 'order'>,
  banks: ReadonlyMap<string, BankContent>
): ResolvedQuizAssignment {
  const problems = validateBankSlots(quiz, banks);
  if (problems.length > 0) throw new BankSlotResolutionError(problems);

  const slotsById = new Map(randomBankSlots(quiz).map((s) => [s.id, s]));
  const questionsById = new Map(quiz.questions.map((q) => [q.id, q]));
  const questions: QuizQuestion[] = [];
  const stimuli: QuizStimulus[] = [...(quiz.stimuli ?? [])];
  const stimulusIds = new Set(stimuli.map((s) => s.id));
  const sessionSlots: QuizSessionBankSlot[] = [];
  const usedIds = new Set<string>();
  let fixedSeen = 0;

  for (const entry of quizOrder(quiz)) {
    if (entry.kind === 'question') {
      const q = questionsById.get(entry.id);
      if (!q || usedIds.has(q.id)) continue;
      usedIds.add(q.id);
      questions.push(q);
      fixedSeen += 1;
      continue;
    }
    const slot = slotsById.get(entry.id);
    if (!slot) continue;
    const bank = banks.get(bankSlotKey(slot));
    if (!bank) continue;
    const points = slot.points ?? 1;
    const poolQuestionIds: string[] = [];
    for (const source of eligibleBankQuestions(bank, slot.targetFilter)) {
      // A bank question drawn by two slots keeps its first slot's points.
      if (usedIds.has(source.id)) continue;
      usedIds.add(source.id);
      const frozen: QuizQuestion = { ...source, points };
      const targets = mergeTargets(source.targets, bank.targets);
      if (targets) frozen.targets = targets;
      else delete frozen.targets;
      if (source.stimulusIds && source.stimulusIds.length > 0) {
        const kept: string[] = [];
        for (const sid of source.stimulusIds) {
          const stim = bank.stimuli?.find((s) => s.id === sid);
          if (!stim) continue;
          if (!stimulusIds.has(sid)) {
            stimulusIds.add(sid);
            stimuli.push({ ...stim });
          }
          kept.push(sid);
        }
        if (kept.length > 0) frozen.stimulusIds = kept;
        else delete frozen.stimulusIds;
      }
      questions.push(frozen);
      poolQuestionIds.push(frozen.id);
    }
    sessionSlots.push({
      id: slot.id,
      count: slot.count ?? 0,
      points,
      poolQuestionIds,
      position: fixedSeen,
    });
  }

  const totalQuestions =
    fixedSeen + sessionSlots.reduce((sum, s) => sum + s.count, 0);
  return { questions, stimuli, sessionSlots, totalQuestions };
}

/** Unbiased random index in [0, n) from `crypto.getRandomValues`. */
function secureIndex(n: number): number {
  if (n <= 1) return 0;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}

export type RandomIndex = (n: number) => number;

/** Fisher-Yates with an injectable index source (tests pass a fixed one). */
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

/**
 * Draw one attempt's question ids (decision 8, 27): fixed ids in session
 * order with each slot's `count` pool ids spliced at `position`, shuffled
 * among themselves. Never call twice for the same attempt — persist the
 * result on the response and reuse it.
 */
export function drawServedQuestionIds(
  publicQuestionIds: readonly string[],
  slots: readonly QuizSessionBankSlot[],
  randomIndex: RandomIndex = secureIndex
): string[] {
  const pooled = new Set(slots.flatMap((s) => s.poolQuestionIds));
  const fixed = publicQuestionIds.filter((id) => !pooled.has(id));
  const bySlotPosition = new Map<number, string[]>();
  for (const slot of slots) {
    const drawn = secureShuffle(slot.poolQuestionIds, randomIndex).slice(
      0,
      slot.count
    );
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

/** Public questions filtered and ordered by a served-id list (draw order wins). */
export function orderServedQuestions<T extends { id: string }>(
  publicQuestions: readonly T[],
  servedIds: readonly string[]
): T[] {
  const byId = new Map(publicQuestions.map((q) => [q.id, q]));
  const out: T[] = [];
  for (const id of servedIds) {
    const q = byId.get(id);
    if (q) out.push(q);
  }
  return out;
}

/** True when `servedIds` is a legal draw for these slots: right size, each pool honoured. */
export function isValidDraw(
  publicQuestionIds: readonly string[],
  slots: readonly QuizSessionBankSlot[],
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

/** "Random · 5 of 18 · 2 pts" style label for a slot row. */
export function describeBankSlot(
  slot: QuizBankSlot,
  eligibleCount: number | null
): string {
  const parts = [`Random · ${slot.count ?? 0}`];
  if (eligibleCount != null) parts[0] += ` of ${eligibleCount}`;
  if (slot.targetFilter && slot.targetFilter.length > 0) {
    parts.push(
      `${slot.targetFilter.length} target${slot.targetFilter.length === 1 ? '' : 's'}`
    );
  }
  const pts = slot.points ?? 1;
  parts.push(`${pts} pt${pts === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

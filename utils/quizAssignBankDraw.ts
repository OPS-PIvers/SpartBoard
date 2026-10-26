import type {
  QuizData,
  QuizQuestion,
  QuizSessionBankSlot,
  QuizStimulus,
} from '@/types';
import type { BankContent } from '@/utils/questionBanks';
import {
  bankSlotKey,
  eligibleBankQuestions,
  quizHasBankSlots,
  quizOrder,
  randomBankSlots,
  randomSlotPool,
  resolveQuizAssignment,
} from '@/utils/questionBanks';
import { fibBlankCount } from '@/utils/quizFibBlanks';
import { logError } from '@/utils/logError';
import { multiAnswerCorrectOptions } from '@/utils/quizMultiAnswer';

export interface QuizAssignContent {
  questions: QuizQuestion[];
  stimuli?: QuizStimulus[];
  /** Drive file the assignment grades against (the frozen copy for bank draws). */
  driveFileId: string;
  /** Set only for bank-draw quizzes. */
  resolvedDriveFileId?: string;
  bankSlots?: QuizSessionBankSlot[];
}

/** Bank slots resolve to their pools and freeze into a Drive copy, as the Quiz widget's assign does. */
export async function resolveQuizAssignContent(
  data: QuizData,
  driveFileId: string,
  deps: {
    loadBankContentsForQuiz: (
      quiz: Pick<QuizData, 'bankSlots'>
    ) => Promise<Map<string, BankContent>>;
    saveDriveSnapshot: (quiz: QuizData) => Promise<string>;
  }
): Promise<QuizAssignContent> {
  if (!quizHasBankSlots(data)) {
    return {
      questions: Array.isArray(data.questions) ? data.questions : [],
      ...(data.stimuli ? { stimuli: data.stimuli } : {}),
      driveFileId,
    };
  }
  const resolved = resolveQuizAssignment(
    data,
    await deps.loadBankContentsForQuiz(data)
  );
  const resolvedDriveFileId = await deps.saveDriveSnapshot({
    ...data,
    questions: resolved.questions,
    stimuli: resolved.stimuli,
    bankSlots: undefined,
    order: undefined,
  });
  return {
    questions: resolved.questions,
    stimuli: resolved.stimuli,
    driveFileId: resolvedDriveFileId,
    resolvedDriveFileId,
    bankSlots: resolved.sessionSlots,
  };
}

/** The fields every grader reads as the answer key; points stay with the slot. */
const ANSWER_KEY_FIELDS = [
  'correctAnswer',
  'incorrectAnswers',
  'alternateAnswers',
  'blankAlternates',
  'allowPartialCredit',
] as const satisfies readonly (keyof QuizQuestion)[];

const norm = (s: string): string =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const sortedNorm = (items: readonly string[]): string =>
  JSON.stringify(items.map(norm).sort());

/** What the student saw as choices; a key edit that changes these can't regrade old answers. */
function presentedChoices(q: QuizQuestion): string | null {
  const wrong = q.incorrectAnswers ?? [];
  switch (q.type) {
    case 'MC':
      return sortedNorm([q.correctAnswer ?? '', ...wrong]);
    case 'MA':
      return sortedNorm([
        ...multiAnswerCorrectOptions(q.correctAnswer),
        ...wrong,
      ]);
    case 'Ordering':
      return sortedNorm((q.correctAnswer ?? '').split('|'));
    case 'Matching': {
      const pairs = (q.correctAnswer ?? '').split('|').map((p) => {
        const sep = p.indexOf(':');
        return sep < 0 ? [p, ''] : [p.slice(0, sep), p.slice(sep + 1)];
      });
      return JSON.stringify([
        sortedNorm(pairs.map(([left]) => left)),
        sortedNorm([
          ...pairs.map(([, right]) => right),
          ...(q.matchingDistractors ?? []),
        ]),
      ]);
    }
    case 'FIB':
      return String(fibBlankCount(q));
    default:
      return null;
  }
}

/** Copies the key fields onto the frozen question, dropping ones the current question no longer has. */
function withKeyFrom(
  frozen: QuizQuestion,
  current: QuizQuestion
): QuizQuestion {
  const out: QuizQuestion = { ...frozen };
  for (const field of ANSWER_KEY_FIELDS) {
    if (current[field] === undefined) delete out[field];
    else Object.assign(out, { [field]: current[field] });
  }
  return out;
}

/** Lays the library quiz's and banks' current answer keys over a bank-draw assignment's frozen copy. */
export function applyCurrentAnswerKeys(
  frozen: QuizData,
  library: Pick<QuizData, 'questions' | 'bankSlots' | 'order'>,
  banks: ReadonlyMap<string, Pick<BankContent, 'questions' | 'targets'>>
): QuizData {
  const current = new Map<string, QuizQuestion>();
  let allBanksLoaded = true;
  const questionsById = new Map(
    (library.questions ?? []).map((q) => [q.id, q])
  );
  const slotsById = new Map(randomBankSlots(library).map((s) => [s.id, s]));
  // First in quiz order wins on a shared id, as resolveQuizAssignment does at assign.
  for (const entry of quizOrder({
    ...library,
    questions: library.questions ?? [],
  })) {
    if (entry.kind === 'question') {
      const q = questionsById.get(entry.id);
      if (q && !current.has(q.id)) current.set(q.id, q);
      continue;
    }
    const slot = slotsById.get(entry.id);
    if (!slot) continue;
    const bank = banks.get(bankSlotKey(slot));
    if (!bank) {
      allBanksLoaded = false;
      continue;
    }
    // Only the questions this slot could deal, so a shared id maps to the slot that dealt it.
    for (const q of eligibleBankQuestions(
      bank,
      slot.targetFilter,
      randomSlotPool(slot)
    ))
      if (!current.has(q.id)) current.set(q.id, q);
  }
  let changed = false;
  const questions = (frozen.questions ?? []).map((q) => {
    const now = current.get(q.id);
    if (!now || now.type !== q.type) return q;
    const shape = presentedChoices(q);
    if (shape === null || shape !== presentedChoices(now)) return q;
    changed = true;
    return withKeyFrom(q, now);
  });
  const out = changed ? { ...frozen, questions } : frozen;
  if (allBanksLoaded) keyedWithAllBanks.add(out);
  return out;
}

const keyedWithAllBanks = new WeakSet<QuizData>();

/** True when every bank in the quiz loaded, so this key may replace the server's copy. */
export function hasEveryCurrentAnswerKey(quiz: QuizData): boolean {
  return keyedWithAllBanks.has(quiz);
}

/** Loads the library quiz and its banks and applies their keys; on failure grades with the frozen copy. */
export async function withCurrentAnswerKeys(
  frozen: QuizData,
  libraryDriveFileId: string,
  deps: {
    loadQuizData: (driveFileId: string) => Promise<QuizData>;
    loadBankContentsForQuiz: (
      quiz: Pick<QuizData, 'bankSlots'>
    ) => Promise<Map<string, BankContent>>;
  }
): Promise<QuizData> {
  try {
    const library = await deps.loadQuizData(libraryDriveFileId);
    return applyCurrentAnswerKeys(
      frozen,
      library,
      await deps.loadBankContentsForQuiz(library)
    );
  } catch (err) {
    logError('quizAssignBankDraw.withCurrentAnswerKeys', err, {
      libraryDriveFileId,
    });
    return frozen;
  }
}

import type {
  QuizData,
  QuizQuestion,
  QuizSessionBankSlot,
  QuizStimulus,
} from '@/types';
import type { BankContent } from '@/utils/questionBanks';
import { quizHasBankSlots, resolveQuizAssignment } from '@/utils/questionBanks';
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
  library: Pick<QuizData, 'questions'>,
  banks: ReadonlyMap<string, Pick<BankContent, 'questions'>>
): QuizData {
  const current = new Map<string, QuizQuestion>();
  // Fixed questions win over a bank copy with the same id, as at assign.
  for (const q of library.questions ?? [])
    if (!current.has(q.id)) current.set(q.id, q);
  for (const bank of banks.values())
    for (const q of bank.questions ?? [])
      if (!current.has(q.id)) current.set(q.id, q);
  let changed = false;
  const questions = (frozen.questions ?? []).map((q) => {
    const now = current.get(q.id);
    if (!now || now.type !== q.type) return q;
    const shape = presentedChoices(q);
    if (shape === null || shape !== presentedChoices(now)) return q;
    changed = true;
    return withKeyFrom(q, now);
  });
  return changed ? { ...frozen, questions } : frozen;
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

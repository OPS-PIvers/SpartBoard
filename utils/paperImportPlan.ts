/**
 * Turns reviewed paper sheets into the payload `importPaperResponsesV1`
 * accepts, and a bubbled ANSWER KEY sheet into the quiz's answer key.
 *
 * Pure. Names and PINs come from the in-memory Drive rosters and only the
 * PIN + period travel to the function, the same two fields an anonymous
 * joiner's response already carries.
 */

import type { ClassRoster, PaperBatch, QuizData, Student } from '@/types';
import type { AssembledSheet } from './paperImportAssemble';
import { CHOICE_LETTERS } from './paperSheetLayout';
import { analyzePaperQuiz } from './paperSheetPlan';

/** Client mirror of the function's `ImportPaperAnswer`. */
export interface ImportPaperAnswerPayload {
  questionId: string;
  answer: string;
  unresponded?: 'passed' | 'paper-unclear';
}

/** Client mirror of the function's `ImportPaperSheet`. */
export interface ImportPaperSheetPayload {
  seat: number;
  rosterId: string;
  pin: string;
  classPeriod: string;
  answers: ImportPaperAnswerPayload[];
  replaceExisting?: boolean;
}

export interface ImportPaperCollision {
  seat: number;
  responseKey: string;
  fromOtherBatch: boolean;
  existingSubmittedAt: number | null;
}

export interface ImportPaperResponsesResult {
  written: number[];
  collisions: ImportPaperCollision[];
}

export type SkipReason = 'blank' | 'unassigned-spare' | 'student-not-found';

export interface SkippedSheet {
  seat: number;
  reason: SkipReason;
}

/** Option text a bubbled choice stands for (plan Q36); a stub's is the letter. */
export function answerTextFor(
  batch: PaperBatch,
  questionId: string,
  choice: number
): string {
  return batch.choiceOrder?.[questionId]?.[choice] ?? CHOICE_LETTERS[choice];
}

/** Question ids in sheet-row order, so row i of the sheet is `rowIds[i]`. */
export function sheetRowQuestionIds(quiz: QuizData): string[] {
  return analyzePaperQuiz(quiz).rows.map((r) => r.questionId);
}

export interface StudentLookup {
  roster: ClassRoster;
  student: Student;
}

export function findStudent(
  rosters: readonly ClassRoster[],
  ref: { rosterId: string; studentId: string }
): StudentLookup | null {
  const roster = rosters.find((r) => r.id === ref.rosterId);
  const student = roster?.students.find((s) => s.id === ref.studentId);
  return roster && student ? { roster, student } : null;
}

export interface BuildImportInput {
  batch: PaperBatch;
  quiz: QuizData;
  rosters: readonly ClassRoster[];
  sheets: readonly AssembledSheet[];
  /** Spares the teacher assigned in review, by seat. */
  spareAssignments: Readonly<
    Record<number, { rosterId: string; studentId: string }>
  >;
}

export interface BuildImportResult {
  payload: ImportPaperSheetPayload[];
  skipped: SkippedSheet[];
}

/**
 * Every question gets exactly one answer entry: the bubbled option, or
 * `passed` for a blank row or a missing page, or `paper-unclear` when the
 * reader doubted the row and the teacher left it (plan Q20/Q22).
 */
export function buildImportPayload(input: BuildImportInput): BuildImportResult {
  const rowIds = sheetRowQuestionIds(input.quiz);
  const payload: ImportPaperSheetPayload[] = [];
  const skipped: SkippedSheet[] = [];

  for (const sheet of input.sheets) {
    if (sheet.kind === 'key') continue;
    if (sheet.isBlank) {
      skipped.push({ seat: sheet.seat, reason: 'blank' });
      continue;
    }
    const ref = sheet.student ?? input.spareAssignments[sheet.seat];
    if (!ref) {
      skipped.push({ seat: sheet.seat, reason: 'unassigned-spare' });
      continue;
    }
    const found = findStudent(input.rosters, ref);
    if (!found || !found.student.pin) {
      skipped.push({ seat: sheet.seat, reason: 'student-not-found' });
      continue;
    }
    const byQuestion = new Map(sheet.answers.map((a) => [a.question, a]));
    const answers: ImportPaperAnswerPayload[] = rowIds.map((questionId, i) => {
      const read = byQuestion.get(i);
      if (read && read.choice !== null) {
        return {
          questionId,
          answer: answerTextFor(input.batch, questionId, read.choice),
        };
      }
      return {
        questionId,
        answer: '',
        unresponded: read?.doubt ? 'paper-unclear' : 'passed',
      };
    });
    payload.push({
      seat: sheet.seat,
      rosterId: ref.rosterId,
      pin: found.student.pin,
      classPeriod: found.roster.name,
      answers,
    });
  }

  return { payload, skipped };
}

/** Choice index bubbled on the key sheet per question id; null where blank or doubtful. */
export function keySheetChoices(
  keySheet: AssembledSheet,
  quiz: QuizData
): Record<string, number | null> {
  const rowIds = sheetRowQuestionIds(quiz);
  const byQuestion = new Map(keySheet.answers.map((a) => [a.question, a]));
  const out: Record<string, number | null> = {};
  rowIds.forEach((id, i) => {
    out[id] = byQuestion.get(i)?.choice ?? null;
  });
  return out;
}

/**
 * Write a confirmed key into the quiz (plan Q30). For a stub the choices are
 * the letters, so the key letter becomes `correctAnswer` and the rest the
 * distractors; an authored quiz maps through its printed order.
 */
export function applyKeyToQuiz(
  quiz: QuizData,
  batch: PaperBatch,
  key: Readonly<Record<string, number | null>>,
  now: number
): QuizData {
  const questions = quiz.questions.map((q) => {
    const choice = key[q.id];
    if (choice === null || choice === undefined) return q;
    const options =
      batch.choiceOrder?.[q.id] ??
      CHOICE_LETTERS.slice(
        0,
        Math.max(2, 1 + (q.incorrectAnswers?.length ?? 0))
      );
    const correct = options[choice];
    if (correct === undefined) return q;
    return {
      ...q,
      correctAnswer: correct,
      incorrectAnswers: options.filter((_, i) => i !== choice),
    };
  });
  return { ...quiz, questions, updatedAt: now };
}

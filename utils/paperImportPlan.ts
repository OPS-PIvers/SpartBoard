/**
 * Turns reviewed paper sheets into the payload `importPaperResponsesV1`
 * accepts, and a bubbled ANSWER KEY sheet into the quiz's answer key.
 *
 * Pure. Names and PINs come from the in-memory Drive rosters and only the
 * PIN + period travel to the function, the same two fields an anonymous
 * joiner's response already carries.
 */

import type {
  ClassRoster,
  PaperBatch,
  PaperRowGroup,
  QuizData,
  QuizQuestion,
  Student,
} from '@/types';
import type { AssembledSheet } from './paperImportAssemble';
import { mcItemsOf } from './paperPageMap';
import { CHOICE_LETTERS } from './paperSheetLayout';
import {
  analyzePaperQuiz,
  isPlaceholderLetterChoices,
  matchingPairs,
} from './paperSheetPlan';
import { encodeMultiAnswer } from './quizMultiAnswer';
import { pageMapsForSeat } from './paperSheetVersions';
import { paperCropStoragePath } from './paperWritten';
import {
  hasArrangedOrder,
  questionFromRows,
  rowsFromQuestion,
} from './quizChoiceRows';

/** Client mirror of the function's `ImportPaperAnswer`. */
export interface ImportPaperAnswerPayload {
  questionId: string;
  answer: string;
  unresponded?: 'passed' | 'paper-unclear';
}

/** Client mirror of `PaperWrittenPayloadBox` (functions/src/paperWrittenTypes.ts), payload v2. */
export interface ImportPaperWrittenPayload {
  questionId: string;
  page: number;
  state: 'ink' | 'blank';
  storagePath: string;
  /** The uploaded crop's type; the modal fills it from the encoded blob. */
  mimeType?: 'image/webp' | 'image/png';
}

/** Client mirror of the function's `ImportPaperSheet`. */
export interface ImportPaperSheetPayload {
  seat: number;
  rosterId: string;
  pin: string;
  classPeriod: string;
  answers: ImportPaperAnswerPayload[];
  /** Handwritten boxes on a page-map batch, blank ones included (D22); written questions never appear in `answers`. */
  written?: ImportPaperWrittenPayload[];
  replaceExisting?: boolean;
}

/** Request fields a page-map batch's import must carry (D30); none for older batches. */
export function paperImportRequestFields(
  batch: Pick<PaperBatch, 'layoutVersion'>,
  scanId: string
): { layoutVersion: 2; scanId: string } | Record<string, never> {
  return batch.layoutVersion === 2 ? { layoutVersion: 2, scanId } : {};
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

const grams = (s: string) => {
  const chars = Array.from(s);
  return new Set([...chars, ...chars.slice(1).map((c, i) => chars[i] + c)]);
};

/** Dice similarity of two normalized texts over their characters and character pairs, 0..1. */
function similarity(a: string, b: string): number {
  const x = grams(a);
  const y = grams(b);
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return x.size + y.size === 0 ? 0 : (2 * shared) / (x.size + y.size);
}

/** A changed choice moved when another changed slot's old text beats its own by this much, or when two changed choices each lean to the other's. */
const MOVE_MARGIN = 0.25;

// Mirrors isRewordOnly in functions/src/paperRewordSync.ts, which adds blank and duplicate guards.
/** True when every choice kept its letter: unchanged, or reworded without looking like another changed choice's old text (a letter stub has no wording to compare). */
export function isRewordOnly(
  recorded: readonly string[],
  current: readonly string[]
): boolean {
  if (recorded.length !== current.length) return false;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const was = recorded.map(norm);
  const now = current.map(norm);
  const changed = now.flatMap((text, i) => (text === was[i] ? [] : [i]));
  if (changed.some((i) => was.includes(now[i]) || now.includes(was[i]))) {
    return false;
  }
  if (changed.length < 2 || isPlaceholderLetterChoices(recorded)) return true;
  // How much closer a changed choice sits to slot j's old text than to its own.
  const pull = (i: number, j: number) =>
    similarity(now[i], was[j]) - similarity(now[i], was[i]);
  return changed.every((i) =>
    changed.every(
      (j) =>
        j === i ||
        (pull(i, j) < MOVE_MARGIN && !(pull(i, j) > 0 && pull(j, i) > 0))
    )
  );
}

/**
 * The options a sheet's bubbles stand for, in letter order (plan Q36). A stub
 * sheet recorded bare letters; once the quiz was filled in from the teacher's
 * paper, those letters mean the filled options in the order her paper prints.
 */
export function printedOptionsFor(
  batch: Pick<PaperBatch, 'choiceOrder'>,
  question: QuizQuestion | undefined,
  questionId: string
): string[] {
  const recorded = batch.choiceOrder?.[questionId];
  if (recorded && !isPlaceholderLetterChoices(recorded)) {
    // A teacher's own paper reworded after printing keeps its letters, so new scans use today's wording.
    if (question?.paperOwnTest && question.type === 'MC') {
      const current = rowsFromQuestion(question).map((r) => r.text);
      if (isRewordOnly(recorded, current)) return current;
    }
    return [...recorded];
  }
  // An own-test fill or an editor arrangement keeps the paper's letters; an older document fill stored the answer first.
  if (
    question &&
    (question.paperOwnTest || hasArrangedOrder(question)) &&
    (question.type === 'MC' || question.type === 'MA')
  ) {
    const filled = rowsFromQuestion(question).map((r) => r.text);
    if (filled.length > 0 && !isPlaceholderLetterChoices(filled)) return filled;
  }
  return recorded
    ? [...recorded]
    : CHOICE_LETTERS.slice(
        0,
        Math.max(2, 1 + (question?.incorrectAnswers?.length ?? 0))
      );
}

/** Each recorded question's printed options, read through the filled quiz for a stub batch. */
export function printedChoiceOrder(
  batch: Pick<PaperBatch, 'choiceOrder'>,
  questions: readonly QuizQuestion[]
): Record<string, string[]> | undefined {
  const out: Record<string, string[]> = {};
  for (const q of questions) {
    const options = printedOptionsFor(batch, q, q.id);
    if (batch.choiceOrder?.[q.id] || !isPlaceholderLetterChoices(options))
      out[q.id] = options;
  }
  for (const [id, recorded] of Object.entries(batch.choiceOrder ?? {})) {
    out[id] ??= [...recorded];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Option text a bubbled choice stands for; a stub's is the letter until the quiz is filled in. */
export function answerTextFor(
  batch: Pick<PaperBatch, 'choiceOrder'>,
  question: QuizQuestion | undefined,
  questionId: string,
  choice: number
): string {
  return (
    printedOptionsFor(batch, question, questionId)[choice] ??
    CHOICE_LETTERS[choice]
  );
}

/**
 * Question ids in sheet-row order, so row i of the sheet is `rowIds[i]`. A
 * page-map batch answers from its maps, which recorded what actually printed.
 */
export function sheetRowQuestionIds(
  quiz: QuizData,
  batch?: Pick<PaperBatch, 'layoutVersion' | 'pageMaps'>
): string[] {
  if (batch?.layoutVersion === 2 && batch.pageMaps) {
    const ids: string[] = [];
    for (const map of batch.pageMaps) {
      for (const item of mcItemsOf(map)) ids[item.sheetRow] = item.questionId;
    }
    return ids;
  }
  return analyzePaperQuiz(quiz).rows.map((r) => r.questionId);
}

/** What each sheet row is: its question and, for a grouped question, which of its rows. */
export interface SheetRowInfo {
  questionId: string;
  group?: PaperRowGroup;
  part?: number;
  across?: true;
}

/** Every sheet row in order; a grouped question takes several. */
export function sheetRowInfos(
  quiz: QuizData,
  batch?: Pick<PaperBatch, 'layoutVersion' | 'pageMaps'>
): SheetRowInfo[] {
  if (batch?.layoutVersion === 2 && batch.pageMaps) {
    const rows: SheetRowInfo[] = [];
    for (const map of batch.pageMaps) {
      for (const item of mcItemsOf(map)) {
        rows[item.sheetRow] = {
          questionId: item.questionId,
          ...(item.group ? { group: item.group } : {}),
          ...(item.part !== undefined ? { part: item.part } : {}),
          ...(item.across ? { across: true as const } : {}),
        };
      }
    }
    return rows;
  }
  return analyzePaperQuiz(quiz).rows.map((r) => ({ questionId: r.questionId }));
}

/** One read row of a grouped question. */
export interface GroupRowRead {
  part: number;
  choice: number | null;
  marked?: readonly number[];
}

/**
 * The answer a grouped question's bubbles spell, in the form its online
 * grading reads; empty when nothing was bubbled.
 */
export function groupAnswerText(
  question: Pick<QuizQuestion, 'type' | 'correctAnswer' | 'incorrectAnswers'>,
  options: readonly string[],
  group: PaperRowGroup,
  rows: readonly GroupRowRead[],
  across: boolean
): string {
  const byPart = [...rows].sort((a, b) => a.part - b.part);
  if (group === 'all') {
    const picked = (byPart[0]?.marked ?? []).flatMap((c) =>
      options[c] !== undefined ? [options[c]] : []
    );
    return encodeMultiAnswer(picked, options);
  }
  if (group === 'match') {
    const lefts = matchingPairs(question.correctAnswer).map(([left]) => left);
    return byPart
      .flatMap((r) =>
        r.choice !== null &&
        lefts[r.part] !== undefined &&
        options[r.choice] !== undefined
          ? [`${lefts[r.part]}:${options[r.choice]}`]
          : []
      )
      .join('|');
  }
  // Ordering across a question-text sheet: each row is an item and its bubble is the item's place.
  if (across) {
    return byPart
      .flatMap((r) =>
        r.choice !== null && options[r.part] !== undefined
          ? [{ item: options[r.part], at: r.choice, part: r.part }]
          : []
      )
      .sort((a, b) => a.at - b.at || a.part - b.part)
      .map((x) => x.item)
      .join('|');
  }
  return byPart
    .flatMap((r) =>
      r.choice !== null && options[r.choice] !== undefined
        ? [options[r.choice]]
        : []
    )
    .join('|');
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
  /** Importing teacher and this scan's id; page-map batches need it to name each crop's Storage path. */
  scan?: { uid: string; scanId: string };
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
  const batchRows = sheetRowInfos(input.quiz, input.batch);
  const questionById = new Map(input.quiz.questions.map((q) => [q.id, q]));
  const rowInfosFor = (seat: number): SheetRowInfo[] =>
    input.batch.versions
      ? sheetRowInfos(input.quiz, {
          layoutVersion: input.batch.layoutVersion,
          pageMaps: pageMapsForSeat(input.batch, seat),
        })
      : batchRows;
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
    const leftOut = new Set(sheet.skippedRows);
    const infos = rowInfosFor(sheet.seat);
    const done = new Set<string>();
    const answers: ImportPaperAnswerPayload[] = infos.flatMap(
      (info, i): ImportPaperAnswerPayload[] => {
        const questionId = info.questionId;
        if (info.group) {
          if (done.has(questionId)) return [];
          done.add(questionId);
          const rows = infos.flatMap((r, k) =>
            r.questionId === questionId ? [{ row: k, info: r }] : []
          );
          // A skipped page leaves the whole question out, so earlier answers stay.
          if (rows.some((r) => leftOut.has(r.row))) return [];
          const reads = rows.map((r) => {
            const read = byQuestion.get(r.row);
            return {
              part: r.info.part ?? 0,
              choice: read?.doubt ? null : (read?.choice ?? null),
              ...(read?.marked && !read.doubt ? { marked: read.marked } : {}),
              doubt: !!read?.doubt,
            };
          });
          // One unread row makes the whole answer unclear, as a doubtful single row does.
          if (reads.some((r) => r.doubt)) {
            return [{ questionId, answer: '', unresponded: 'paper-unclear' }];
          }
          const question = questionById.get(questionId);
          const text = question
            ? groupAnswerText(
                question,
                printedOptionsFor(input.batch, question, questionId),
                info.group,
                reads,
                !!info.across
              )
            : '';
          if (text) return [{ questionId, answer: text }];
          return [{ questionId, answer: '', unresponded: 'passed' }];
        }
        if (leftOut.has(i)) return [];
        const read = byQuestion.get(i);
        if (read && read.choice !== null) {
          return [
            {
              questionId,
              answer: answerTextFor(
                input.batch,
                questionById.get(questionId),
                questionId,
                read.choice
              ),
            },
          ];
        }
        return [
          {
            questionId,
            answer: '',
            unresponded: read?.doubt ? 'paper-unclear' : 'passed',
          },
        ];
      }
    );
    const scan = input.scan;
    const written =
      scan && sheet.written
        ? sheet.written.map((w) => ({
            questionId: w.questionId,
            page: w.page,
            state: w.state,
            storagePath: paperCropStoragePath(
              scan.uid,
              scan.scanId,
              sheet.seat,
              w.questionId
            ),
          }))
        : null;
    payload.push({
      seat: sheet.seat,
      rosterId: ref.rosterId,
      pin: found.student.pin,
      classPeriod: found.roster.name,
      answers,
      ...(written ? { written } : {}),
    });
  }

  return { payload, skipped };
}

/** Choice index bubbled on the key sheet per question id; null where blank or doubtful. */
export function keySheetChoices(
  keySheet: AssembledSheet,
  quiz: QuizData,
  batch?: Pick<PaperBatch, 'layoutVersion' | 'pageMaps'>
): Record<string, number | null> {
  const rows = sheetRowInfos(quiz, batch);
  const byQuestion = new Map(keySheet.answers.map((a) => [a.question, a]));
  const out: Record<string, number | null> = {};
  rows.forEach((info, i) => {
    if (!info.group) out[info.questionId] = byQuestion.get(i)?.choice ?? null;
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
    if (choice === null || choice === undefined || q.type !== 'MC') return q;
    let options = printedOptionsFor(batch, q, q.id);
    const current = rowsFromQuestion(q).map((r) => r.text);
    // Printed text the quiz no longer has: keep its current wording by position, or leave the question alone.
    if (!options.every((t) => current.includes(t))) {
      if (
        !(q.paperOwnTest || hasArrangedOrder(q)) ||
        isPlaceholderLetterChoices(options) ||
        !isRewordOnly(options, current)
      ) {
        return q;
      }
      options = current;
    }
    const correct = options[choice];
    if (correct === undefined) return q;
    // Keep each option where the sheet lettered it, so a reprint letters it the same way.
    const { optionOrder } = questionFromRows(
      options.map((text, i) => ({ text, correct: i === choice })),
      false
    );
    const { optionOrder: _old, ...rest } = q;
    return {
      ...rest,
      correctAnswer: correct,
      incorrectAnswers: options.filter((_, i) => i !== choice),
      ...(optionOrder ? { optionOrder } : {}),
    };
  });
  return { ...quiz, questions, updatedAt: now };
}

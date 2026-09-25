import type { PaperBatch, PaperPageMap, QuizData, QuizResponse } from '@/types';
import { normalizeAnswer } from '@/hooks/useQuizSession';
import { selectRepresentativeAnswers } from './answerTakeOrdering';
import {
  CHOICE_LETTERS,
  pageCountForQuestions,
  paperGridOf,
  type PaperGrid,
} from './paperSheetLayout';
import { mcItemsOf } from './paperPageMap';
import { analyzePaperQuiz } from './paperSheetPlan';
import type { PaperSheetQuestionText, SheetFill } from './paperSheetPrint';

/** A paper response mapped back onto the sheet it was bubbled on. */
export interface SheetReprint {
  batchId: string;
  seat: number;
  questionCount: number;
  choiceCount: number;
  columnsPerPage: PaperGrid;
  /** Question text per row, when the batch printed it beside the bubbles. */
  questionTexts?: PaperSheetQuestionText[];
  pageCount: number;
  /** The batch's page maps (layoutVersion 2); the reprint then draws every page from them (D42). */
  pageMaps?: PaperPageMap[];
  /** Stem per written question id, for the headers above its box. */
  writtenTexts?: Record<string, string>;
  /** Bubble the student filled per row; null for a passed or unclear row. */
  filled: (number | null)[];
  /** The key's bubble per row; null when the quiz has no key for it. */
  correct: (number | null)[];
  unclear: boolean[];
}

/** Bubble index of an option's text on this batch's sheet: its place in the printed order, or a bare letter for a stub. */
function bubbleFor(
  batch: PaperBatch,
  questionId: string,
  text: string
): number | null {
  if (!text) return null;
  const order = batch.choiceOrder?.[questionId];
  if (order) {
    let i = order.indexOf(text);
    if (i < 0) {
      const wanted = normalizeAnswer(text);
      i = order.findIndex((o) => normalizeAnswer(o) === wanted);
    }
    return i < 0 ? null : i;
  }
  const letter = CHOICE_LETTERS.indexOf(text.trim().toUpperCase());
  return letter < 0 ? null : letter;
}

function writtenTextsOf(
  pageMaps: readonly PaperPageMap[],
  questions: ReadonlyMap<string, { text: string }>
): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const map of pageMaps) {
    for (const item of map.items) {
      const text = questions.get(item.questionId)?.text;
      if (item.kind === 'written' && text) texts[item.questionId] = text;
    }
  }
  return texts;
}

/** Redraws a paper response from its batch; no scan needed (D22). Null for online work. */
export function planSheetReprint(
  response: QuizResponse,
  batch: PaperBatch,
  quiz: QuizData
): SheetReprint | null {
  if (!response.paperBatchId || response.paperSeat === undefined) return null;
  const pageMaps =
    batch.layoutVersion === 2 && batch.pageMaps?.length
      ? batch.pageMaps
      : undefined;
  // A v2 batch reads its MC rows off the map, in sheet-row order; older batches recompute them.
  const rows = pageMaps
    ? pageMaps
        .flatMap(mcItemsOf)
        .sort((a, b) => a.sheetRow - b.sheetRow)
        .map((item) => ({ questionId: item.questionId }))
    : analyzePaperQuiz(quiz).rows;
  const questions = new Map(quiz.questions.map((q) => [q.id, q]));
  const answers = selectRepresentativeAnswers(response.answers ?? []);
  const columnsPerPage = paperGridOf(batch);
  const filled: (number | null)[] = [];
  const correct: (number | null)[] = [];
  const unclear: boolean[] = [];
  for (const row of rows) {
    const entry = answers.get(row.questionId);
    filled.push(
      entry && !entry.unresponded
        ? bubbleFor(batch, row.questionId, entry.answer ?? '')
        : null
    );
    unclear.push(entry?.unresponded === 'paper-unclear');
    const key = questions.get(row.questionId)?.correctAnswer ?? '';
    correct.push(key.trim() ? bubbleFor(batch, row.questionId, key) : null);
  }
  return {
    batchId: batch.id,
    seat: response.paperSeat,
    questionCount: rows.length,
    choiceCount: batch.choiceCount,
    columnsPerPage,
    ...(columnsPerPage === 'questions'
      ? {
          questionTexts: rows.map((row) => ({
            text: questions.get(row.questionId)?.text ?? '',
            choices: batch.choiceOrder?.[row.questionId] ?? [],
          })),
        }
      : {}),
    pageCount: pageMaps
      ? pageMaps.length
      : Math.max(
          batch.pagesPerSheet || 0,
          pageCountForQuestions(rows.length, columnsPerPage)
        ),
    ...(pageMaps
      ? { pageMaps, writtenTexts: writtenTextsOf(pageMaps, questions) }
      : {}),
    filled,
    correct,
    unclear,
  };
}

export interface SheetReprintMarks {
  markAnswers: boolean;
  keyMode: 'off' | 'missed' | 'all';
  score?: string;
}

/** The marks D23 draws: solid pick, margin ✓/✗ or "?", a ringed key per the key mode. */
export function sheetFillFor(
  reprint: SheetReprint,
  options: SheetReprintMarks
): SheetFill {
  const right = (i: number) =>
    reprint.filled[i] !== null && reprint.filled[i] === reprint.correct[i];
  return {
    filled: reprint.filled,
    key: reprint.correct.map((c, i) => {
      if (c === null || options.keyMode === 'off') return null;
      if (options.keyMode === 'all') return c;
      return reprint.filled[i] !== null && !right(i) ? c : null;
    }),
    marks: reprint.filled.map((f, i) => {
      if (reprint.unclear[i]) return 'unclear';
      if (!options.markAnswers || reprint.correct[i] === null) return null;
      return f !== null && right(i) ? 'correct' : 'incorrect';
    }),
    ...(options.score ? { score: options.score } : {}),
  };
}

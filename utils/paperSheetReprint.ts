import type { PaperBatch, QuizData, QuizResponse } from '@/types';
import { normalizeAnswer } from '@/hooks/useQuizSession';
import { selectRepresentativeAnswers } from './answerTakeOrdering';
import {
  CHOICE_LETTERS,
  pageCountForQuestions,
  paperGridOf,
  type PaperGrid,
} from './paperSheetLayout';
import { analyzePaperQuiz } from './paperSheetPlan';
import type { SheetFill } from './paperSheetPrint';

/** A paper response mapped back onto the sheet it was bubbled on. */
export interface SheetReprint {
  batchId: string;
  seat: number;
  questionCount: number;
  choiceCount: number;
  columnsPerPage: PaperGrid;
  pageCount: number;
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

/** Redraws a paper response from its batch; no scan needed (D22). Null for online work. */
export function planSheetReprint(
  response: QuizResponse,
  batch: PaperBatch,
  quiz: QuizData
): SheetReprint | null {
  if (!response.paperBatchId || response.paperSeat === undefined) return null;
  const rows = analyzePaperQuiz(quiz).rows;
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
    pageCount: Math.max(
      batch.pagesPerSheet || 0,
      pageCountForQuestions(rows.length, columnsPerPage)
    ),
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

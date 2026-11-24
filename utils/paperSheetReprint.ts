import { choicePictureFields } from '@/utils/quizAnswerImages';
import { promptLabelOf } from '@/utils/quizPromptText';
import type {
  PaperBatch,
  PaperPageMap,
  PaperRowGroup,
  QuizData,
  QuizResponse,
} from '@/types';
import { normalizeAnswer } from '@/hooks/useQuizSession';
import { selectRepresentativeAnswers } from './answerTakeOrdering';
import {
  CHOICE_LETTERS,
  pageCountForQuestions,
  paperGridOf,
  type PaperGrid,
} from './paperSheetLayout';
import { groupRowBubbles, printedChoiceOrder } from './paperImportPlan';
import { mcItemsOf } from './paperPageMap';
import { analyzePaperQuiz, matchingPairs } from './paperSheetPlan';
import { pageMapsForSeat } from './paperSheetVersions';
import type {
  PaperSheetQuestionText,
  PaperGroupText,
  SheetFill,
  SheetWrittenFill,
} from './paperSheetPrint';

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
  /** Printed page number of each reprint page, only when prompt pages were left out and the numbers moved. */
  printedPages?: number[];
  /** Stem per written question id, for the headers above its box. */
  writtenTexts?: Record<string, string>;
  /** Bubble the student filled per row; null for a passed or unclear row. */
  filled: (number | null)[];
  /** The key's bubble per row; null when the quiz has no key for it. */
  correct: (number | null)[];
  unclear: boolean[];
  /** Choose all rows: the bubbles filled and the key's bubbles, by sheet row. */
  filledSets?: Record<number, number[]>;
  correctSets?: Record<number, number[]>;
  /** Matching, ordering and choose all text, for a question-text sheet. */
  groupTexts?: Record<string, PaperGroupText>;
}

/** Bubble index of an option's text on this batch's sheet: its place in the printed order, or a bare letter for a stub. */
function bubbleFor(
  choiceOrder: Record<string, string[]> | undefined,
  questionId: string,
  text: string,
  recorded?: Record<string, string[]>
): number | null {
  if (!text) return null;
  // An answer scanned before a choice was reworded still holds the wording printed then.
  for (const order of [choiceOrder?.[questionId], recorded?.[questionId]]) {
    if (!order) continue;
    let i = order.indexOf(text);
    if (i < 0) {
      const wanted = normalizeAnswer(text);
      i = order.findIndex((o) => normalizeAnswer(o) === wanted);
    }
    if (i >= 0) return i;
  }
  // A stub answer imported before the quiz was filled in is still a bare letter.
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
  const seatMaps =
    batch.layoutVersion === 2 && batch.pageMaps?.length
      ? // A prompt page holds nothing the student wrote, so a reprint leaves it out.
        pageMapsForSeat(batch, response.paperSeat)?.filter((m) => !m.prompt)
      : undefined;
  const pageMaps = seatMaps?.map((m, i) => ({ ...m, page: i + 1 }));
  const printedPages = seatMaps?.some((m, i) => m.page !== i + 1)
    ? seatMaps.map((m) => m.page)
    : undefined;
  // A v2 batch reads its MC rows off the map, in sheet-row order; older batches recompute them.
  const rows = pageMaps
    ? pageMaps
        .flatMap(mcItemsOf)
        .sort((a, b) => a.sheetRow - b.sheetRow)
        .map((item) => ({
          questionId: item.questionId,
          group: item.group,
          part: item.part ?? 0,
          across: !!item.across,
        }))
    : analyzePaperQuiz(quiz).rows.map((r) => ({
        questionId: r.questionId,
        group: undefined,
        part: 0,
        across: false,
      }));
  const questions = new Map(quiz.questions.map((q) => [q.id, q]));
  const answers = selectRepresentativeAnswers(response.answers ?? []);
  const columnsPerPage = paperGridOf(batch);
  const choiceOrder = printedChoiceOrder(batch, quiz.questions);
  const filled: (number | null)[] = [];
  const correct: (number | null)[] = [];
  const unclear: boolean[] = [];
  const filledSets: Record<number, number[]> = {};
  const correctSets: Record<number, number[]> = {};
  const groupTexts: Record<string, PaperGroupText> = {};
  rows.forEach((row, i) => {
    const entry = answers.get(row.questionId);
    const question = questions.get(row.questionId);
    unclear.push(entry?.unresponded === 'paper-unclear');
    if (row.group && question) {
      const options = choiceOrder?.[row.questionId] ?? [];
      const bubbles = (text: string) =>
        groupRowBubbles(
          question,
          options,
          row.group as PaperRowGroup,
          row.part,
          row.across,
          text
        );
      const got =
        entry && !entry.unresponded ? bubbles(entry.answer ?? '') : null;
      const key = bubbles(question.correctAnswer ?? '');
      filled.push(typeof got === 'number' ? got : null);
      correct.push(typeof key === 'number' ? key : null);
      if (Array.isArray(got)) filledSets[i] = got;
      if (Array.isArray(key)) correctSets[i] = key;
      groupTexts[row.questionId] ??= {
        text: promptLabelOf(question),
        options,
        ...(row.group === 'match'
          ? {
              terms: matchingPairs(question.correctAnswer).map(([l]) => l),
            }
          : {}),
      };
      return;
    }
    filled.push(
      entry && !entry.unresponded
        ? bubbleFor(
            choiceOrder,
            row.questionId,
            entry.answer ?? '',
            batch.choiceOrder
          )
        : null
    );
    const key = question?.correctAnswer ?? '';
    correct.push(
      key.trim() ? bubbleFor(choiceOrder, row.questionId, key) : null
    );
  });
  return {
    batchId: batch.id,
    seat: response.paperSeat,
    questionCount: rows.length,
    choiceCount: batch.choiceCount,
    columnsPerPage,
    ...(columnsPerPage === 'questions'
      ? {
          questionTexts: rows.map((row) => ({
            text: promptLabelOf(questions.get(row.questionId)),
            choices: choiceOrder?.[row.questionId] ?? [],
            ...choicePictureFields(
              questions.get(row.questionId),
              choiceOrder?.[row.questionId] ?? []
            ),
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
    ...(printedPages ? { printedPages } : {}),
    filled,
    correct,
    unclear,
    ...(Object.keys(filledSets).length ? { filledSets } : {}),
    ...(Object.keys(correctSets).length ? { correctSets } : {}),
    ...(Object.keys(groupTexts).length ? { groupTexts } : {}),
  };
}

/** The page number printed on reprint page `index` (0-based), which is what a kept page is filed under. */
export function printedPageOf(
  reprint: Pick<SheetReprint, 'printedPages'>,
  index: number
): number {
  return reprint.printedPages?.[index] ?? index + 1;
}

export interface SheetReprintMarks {
  markAnswers: boolean;
  keyMode: 'off' | 'missed' | 'all';
  score?: string;
  /** Crop, points and comment per written question id (D42). */
  written?: Readonly<Record<string, SheetWrittenFill>>;
}

/** The marks D23 draws: solid pick, margin ✓/✗ or "?", a ringed key per the key mode. */
export function sheetFillFor(
  reprint: SheetReprint,
  options: SheetReprintMarks
): SheetFill {
  const sameSet = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const answered = (i: number) =>
    reprint.filled[i] !== null || !!reprint.filledSets?.[i]?.length;
  const hasKey = (i: number) =>
    reprint.correct[i] !== null || reprint.correctSets?.[i] !== undefined;
  const right = (i: number) => {
    const want = reprint.correctSets?.[i];
    if (want) return sameSet(reprint.filledSets?.[i] ?? [], want);
    return (
      reprint.filled[i] !== null && reprint.filled[i] === reprint.correct[i]
    );
  };
  const showKey = (i: number) =>
    options.keyMode === 'all' ||
    (options.keyMode === 'missed' && answered(i) && !right(i));
  const keySets = Object.fromEntries(
    Object.entries(reprint.correctSets ?? {}).filter(([i]) =>
      showKey(Number(i))
    )
  );
  return {
    filled: reprint.filled,
    key: reprint.correct.map((c, i) =>
      c === null || options.keyMode === 'off' || !showKey(i) ? null : c
    ),
    marks: reprint.filled.map((_, i) => {
      if (reprint.unclear[i]) return 'unclear';
      if (!options.markAnswers || !hasKey(i)) return null;
      return answered(i) && right(i) ? 'correct' : 'incorrect';
    }),
    ...(reprint.filledSets ? { filledSets: reprint.filledSets } : {}),
    ...(options.keyMode !== 'off' && Object.keys(keySets).length
      ? { keySets }
      : {}),
    ...(options.score ? { score: options.score } : {}),
    ...(options.written ? { written: options.written } : {}),
  };
}

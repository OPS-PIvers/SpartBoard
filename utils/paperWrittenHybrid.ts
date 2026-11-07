// Written answers on paper for a device quiz: the written-answers-only stack and its print job.
import type { ClassRoster, PaperBatch, QuizData, Student } from '@/types';
import type { AssignClassesValue } from '@/utils/assignTargets';
import {
  analyzePaperQuiz,
  planPaperBatch,
  type PaperQuizAnalysis,
  type PaperSheetPlan,
} from './paperSheetPlan';
import { planPaperPages } from './paperPageMap';
import type { PaperPrintJob } from './paperSheetPrint';
import { paperSelectedStudentIds } from './paperAssignClasses';

export const PAPER_WRITTEN_HYBRID_FEATURE = 'paper-written-hybrid';

/** The quiz's paper analysis with the bubble rows dropped: only written boxes print. */
export function writtenOnlyAnalysis(quiz: QuizData): PaperQuizAnalysis {
  const full = analyzePaperQuiz(quiz, { written: true });
  return {
    ...full,
    rows: [],
    shortRows: [],
    entries: full.entries.filter((e) => e.kind === 'written'),
  };
}

/** Written questions that can go on paper; a bank-slot quiz keeps everything on the device. */
export function paperWrittenQuestionIds(quiz: QuizData): string[] {
  if ((quiz.bankSlots?.length ?? 0) > 0) return [];
  return writtenOnlyAnalysis(quiz).written.map((w) => w.questionId);
}

const studentSort = (a: Student, b: Student): number =>
  `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);

export type HybridBatchPlan =
  | {
      ok: true;
      batch: PaperBatch;
      sheets: PaperSheetPlan[];
      questionIds: string[];
    }
  | { ok: false; reason: 'none' | 'too-many-pages'; pageCount?: number };

/** One sheet per picked student plus spares, laid out from the written boxes alone. */
export function planHybridWrittenBatch(input: {
  quiz: QuizData;
  classes: AssignClassesValue;
  rosters: readonly ClassRoster[];
  spareCount: number;
  batchId: string;
  now: number;
}): HybridBatchPlan {
  const { quiz, classes, rosters } = input;
  const analysis = writtenOnlyAnalysis(quiz);
  const questionIds = paperWrittenQuestionIds(quiz);
  if (questionIds.length === 0) return { ok: false, reason: 'none' };
  const pages = planPaperPages({
    entries: analysis.entries,
    grid: 2,
    stems: true,
  });
  if (!pages.ok)
    return {
      ok: false,
      reason: 'too-many-pages',
      pageCount: pages.pageCount,
    };
  const picked = paperSelectedStudentIds(classes, rosters);
  const selections = rosters
    .filter((r) => picked[r.id])
    .map((roster) => ({
      roster,
      students: [...roster.students]
        .sort(studentSort)
        .filter((s) => picked[roster.id].has(s.id)),
    }))
    .filter((s) => s.students.length > 0);
  const { batch, sheets } = planPaperBatch({
    batchId: input.batchId,
    quizId: quiz.id,
    selections,
    questionCount: 0,
    choiceCount: Math.max(2, analysis.sheetChoiceCount),
    spareCount: input.spareCount,
    includeKeySheet: false,
    questions: [],
    pageMaps: pages.pageMaps,
    createdAt: input.now,
  });
  return { ok: true, batch, sheets, questionIds };
}

/** The print job for a written-answers-only stack (first print or reprint). */
export function hybridPrintJob(
  quiz: QuizData,
  batch: PaperBatch,
  sheets: readonly PaperSheetPlan[]
): PaperPrintJob {
  return {
    batchId: batch.id,
    quizTitle: quiz.title,
    questionCount: batch.questionCount,
    choiceCount: batch.choiceCount,
    sheets,
    ...(batch.pageMaps ? { pageMaps: batch.pageMaps } : {}),
    writtenTexts: Object.fromEntries(quiz.questions.map((q) => [q.id, q.text])),
  };
}

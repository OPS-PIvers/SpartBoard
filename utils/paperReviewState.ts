/**
 * Converts an in-progress review to and from the compact `pendingReview`
 * shape stored on the batch (plan Q26). Pure; the crops live elsewhere.
 */

import type {
  PaperBatch,
  PaperPendingReview,
  PaperPendingSheet,
  PaperSeatAssignment,
  QuestionTargetTag,
  QuizData,
} from '@/types';
import type {
  AssembledSheet,
  AssembleResult,
  SheetAnswer,
} from './paperImportAssemble';

export interface ReviewState {
  assembled: AssembleResult;
  assignmentId: string;
  key: Record<string, number | null>;
  keyConfirmed: boolean;
  spareAssignments: Record<number, PaperSeatAssignment>;
  targets: Record<string, QuestionTargetTag[]>;
}

const NO_CROP = { x: 0, y: 0, w: 0, h: 0 };

const compactSheet = (sheet: AssembledSheet): PaperPendingSheet => ({
  seat: sheet.seat,
  kind: sheet.kind,
  student: sheet.student,
  answers: sheet.answers.map((a) => ({
    question: a.question,
    choice: a.choice,
    ...(a.doubt ? { doubt: a.doubt } : {}),
  })),
  pagesSeen: sheet.pagesSeen,
  missingPages: sheet.missingPages,
  isBlank: sheet.isBlank,
  flags: sheet.flags,
});

// Fills and crop rectangles only mean something while the scan is in memory.
const expandSheet = (sheet: PaperPendingSheet): AssembledSheet => ({
  seat: sheet.seat,
  kind: sheet.kind,
  student: sheet.student,
  answers: sheet.answers.map(
    (a): SheetAnswer => ({
      question: a.question,
      choice: a.choice,
      ...(a.doubt ? { doubt: a.doubt } : {}),
      fills: [],
      crop: NO_CROP,
      scanIndex: -1,
    })
  ),
  pagesSeen: sheet.pagesSeen,
  missingPages: sheet.missingPages,
  isBlank: sheet.isBlank,
  flags: sheet.flags,
});

export function toPendingReview(
  state: ReviewState,
  savedAt: number
): PaperPendingReview {
  return {
    savedAt,
    assignmentId: state.assignmentId,
    sheets: state.assembled.sheets.map(compactSheet),
    keySheet: state.assembled.keySheet
      ? compactSheet(state.assembled.keySheet)
      : null,
    unreadablePages: state.assembled.unreadablePages,
    foreignPages: state.assembled.foreignPages,
    unknownPages: state.assembled.unknownPages,
    key: state.key,
    keyConfirmed: state.keyConfirmed,
    spareAssignments: state.spareAssignments,
    targets: state.targets,
  };
}

export function fromPendingReview(review: PaperPendingReview): ReviewState {
  return {
    assembled: {
      sheets: review.sheets.map(expandSheet),
      keySheet: review.keySheet ? expandSheet(review.keySheet) : null,
      unreadablePages: review.unreadablePages,
      foreignPages: review.foreignPages,
      unknownPages: review.unknownPages,
    },
    assignmentId: review.assignmentId,
    key: review.key,
    keyConfirmed: review.keyConfirmed,
    spareAssignments: review.spareAssignments,
    targets: review.targets,
  };
}

/** Targets already on the quiz, keyed by question id, as the review's starting point. */
export function targetsFromQuiz(
  quiz: QuizData
): Record<string, QuestionTargetTag[]> {
  const out: Record<string, QuestionTargetTag[]> = {};
  for (const q of quiz.questions) {
    if (q.targets && q.targets.length > 0) out[q.id] = q.targets;
  }
  return out;
}

const sameTags = (a: QuestionTargetTag[], b: QuestionTargetTag[]) =>
  a.length === b.length &&
  a.every((t, i) => t.id === b[i]?.id && t.label === b[i]?.label);

/** Write review-time tags onto the quiz (plan Q27); returns the same object when nothing changed. */
export function applyTargetsToQuiz(
  quiz: QuizData,
  targets: Readonly<Record<string, QuestionTargetTag[]>>,
  now: number
): QuizData {
  let changed = false;
  const questions = quiz.questions.map((q) => {
    const next = targets[q.id] ?? [];
    const prev = q.targets ?? [];
    if (sameTags(prev, next)) return q;
    changed = true;
    const { targets: _drop, ...rest } = q;
    void _drop;
    return next.length > 0 ? { ...rest, targets: next } : rest;
  });
  return changed ? { ...quiz, questions, updatedAt: now } : quiz;
}

/** A shape check so a stale review never meets a reprinted batch. */
export function pendingReviewMatches(
  batch: PaperBatch,
  review: PaperPendingReview
): boolean {
  const sheets = [
    ...review.sheets,
    ...(review.keySheet ? [review.keySheet] : []),
  ];
  return sheets.every(
    (s) =>
      s.answers.every((a) => a.question < batch.questionCount) &&
      (batch.seats[s.seat] !== undefined ||
        batch.spareSeats.includes(s.seat) ||
        batch.keySheetSeat === s.seat)
  );
}

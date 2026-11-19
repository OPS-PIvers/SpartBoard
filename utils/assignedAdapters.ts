import type {
  FlashcardAssignment,
  FlashcardProgress,
  GuidedLearningAssignment,
  GuidedLearningResponse,
  MiniAppAssignment,
  VideoActivityAssignment,
  VideoActivityResponse,
  WritingAssignmentRecord,
  WritingAssignmentSession,
  WritingResponse,
} from '@/types';
import {
  buildAssignedInput,
  scoresShown,
  type AssignedExtras,
  type AssignedInput,
  type AssignedResponse,
} from '@/utils/assignedStatus';

/** Assigned tab marks a kind's doc may carry once its Close and Move to Done write them (D24, D5). */
interface Marks {
  closedAt?: number | null;
  doneAt?: number | null;
}

/** A Video Activity response as the row counts it; a joined student is watching, so started. */
export const videoActivityAssignedResponse = (
  r: Pick<VideoActivityResponse, 'classId' | 'classPeriod' | 'completedAt'>
): AssignedResponse => ({
  classId: r.classId,
  classPeriod: r.classPeriod,
  started: true,
  submitted: r.completedAt != null,
});

/** Normalizes a Video Activity assignment; a view-only share has no scores (D16). */
export function videoActivityAssignedInput(
  a: VideoActivityAssignment & Marks,
  extras: AssignedExtras
): AssignedInput {
  const viewOnly = a.mode === 'view-only';
  return buildAssignedInput(
    a,
    {
      kind: 'video-activity',
      title: a.activityTitle,
      viewOnly,
      publishesScores: !viewOnly,
      scoresPublished: scoresShown(a.scoreVisibility),
    },
    extras
  );
}

/** A Guided Learning response as the row counts it; a response doc exists only once a student starts. */
export const guidedLearningAssignedResponse = (
  r: Pick<GuidedLearningResponse, 'classId' | 'classPeriod' | 'completedAt'>
): AssignedResponse => ({
  classId: r.classId,
  classPeriod: r.classPeriod,
  started: true,
  submitted: r.completedAt != null,
});

/** Normalizes a Guided Learning assignment; `archived` reads as ended (D20). */
export function guidedLearningAssignedInput(
  a: GuidedLearningAssignment & Marks,
  extras: AssignedExtras
): AssignedInput {
  const viewOnly = a.assignmentMode === 'view-only';
  return buildAssignedInput(
    a,
    {
      kind: 'guided-learning',
      title: a.setTitle,
      viewOnly,
      publishesScores: !viewOnly,
      scoresPublished: scoresShown(a.scoreVisibility),
    },
    extras
  );
}

/** A Mini App submission as the row counts it; submissions carry no class, so the caller names it. */
export const miniAppAssignedResponse = (
  classId?: string,
  classPeriod?: string
): AssignedResponse => ({
  classId,
  classPeriod,
  started: true,
  submitted: true,
});

/** Normalizes a Mini App assignment; only results-version 2 runs publish scores. */
export function miniAppAssignedInput(
  a: MiniAppAssignment & Marks,
  extras: AssignedExtras
): AssignedInput {
  const viewOnly = a.mode === 'view-only';
  return buildAssignedInput(
    a,
    {
      kind: 'mini-app',
      title: a.assignmentName?.trim() ? a.assignmentName : a.appTitle,
      viewOnly,
      publishesScores: !viewOnly && a.resultsVersion === 2,
      scoresPublished: scoresShown(a.scoreVisibility),
    },
    extras
  );
}

/** A Flashcards progress doc as the row counts it; only a Check is submitted. */
export const flashcardAssignedResponse = (
  r: Pick<FlashcardProgress, 'classId' | 'submittedAt'>
): AssignedResponse => ({
  classId: r.classId,
  started: true,
  submitted: r.submittedAt != null,
});

/** Normalizes a Flashcards assignment; a Study resource never publishes scores. */
export function flashcardAssignedInput(
  a: FlashcardAssignment & Marks,
  extras: AssignedExtras
): AssignedInput {
  return buildAssignedInput(
    a,
    {
      kind: 'flashcards',
      title: a.setTitle,
      viewOnly: false,
      publishesScores: a.kind === 'check',
      scoresPublished: scoresShown(a.scoreVisibility),
    },
    extras
  );
}

/** A Writing response as the row counts it; a piece out for revising is not turned in. */
export const writingAssignedResponse = (
  r: Pick<WritingResponse, 'classId' | 'status'>
): AssignedResponse => ({
  classId: r.classId,
  started: true,
  submitted: r.status === 'turned-in' || r.status === 'returned',
});

/** Normalizes a Writing record; grading and publishing live on its session, null while it loads. */
export function writingAssignedInput(
  record: WritingAssignmentRecord & Marks,
  session: Pick<
    WritingAssignmentSession,
    'grading' | 'scorePublishedAt'
  > | null,
  extras: AssignedExtras
): AssignedInput {
  const ungraded = session?.grading.mode === 'ungraded';
  return buildAssignedInput(
    record,
    {
      kind: 'writing',
      title: record.title,
      viewOnly: false,
      publishesScores: !ungraded,
      scoresPublished: session?.scorePublishedAt != null,
    },
    session ? extras : { ...extras, needsGrading: null }
  );
}

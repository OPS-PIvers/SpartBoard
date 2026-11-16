// Pure helpers for Writing assignment Library items (docs/plans/WRITING_ASSIGNMENT.md).
import type { WritingAssignmentDefinition, WritingGrading } from '@/types';
import { isInvalidWordRange, wordLimitBounds } from '@/utils/wordLimit';
import { suggestDuplicateTitle } from '@/components/common/library/libraryDuplicate';

/** Matches the stimuli size cap in firestore.rules. */
export const MAX_WRITING_STIMULI = 10;
export const MAX_WRITING_POINTS = 1000;
export const UNTITLED_WRITING_ASSIGNMENT = 'Untitled writing assignment';

/** "1 point", "20 points". */
export const writingPointsLabel = (points: number): string =>
  `${points} point${points === 1 ? '' : 's'}`;

/** A points total is a whole number from 1 to the cap. */
export const clampWritingPoints = (points: number): number =>
  Number.isFinite(points)
    ? Math.min(MAX_WRITING_POINTS, Math.max(1, Math.round(points)))
    : 1;

const normalizeGrading = (
  grading: WritingGrading | undefined
): WritingGrading => {
  if (!grading) return { mode: 'ungraded' };
  switch (grading.mode) {
    case 'ungraded':
      return { mode: 'ungraded' };
    case 'points':
      return { mode: 'points', points: clampWritingPoints(grading.points) };
    case 'rubric':
      return grading.rubricSnapshot
        ? {
            mode: 'rubric',
            rubricId: grading.rubricId || grading.rubricSnapshot.id,
            rubricSnapshot: grading.rubricSnapshot,
          }
        : { mode: 'ungraded' };
  }
};

/** The shape written to Firestore: trimmed title, capped stimuli, valid limits and grading. */
export function normalizeWritingAssignment(
  assignment: WritingAssignmentDefinition,
  now: number
): WritingAssignmentDefinition {
  const { min, max } = wordLimitBounds(assignment);
  const validRange = !isInvalidWordRange(min, max);
  const next: WritingAssignmentDefinition = {
    id: assignment.id,
    title: assignment.title.trim() || UNTITLED_WRITING_ASSIGNMENT,
    prompt: assignment.prompt ?? '',
    stimuli: (assignment.stimuli ?? []).slice(0, MAX_WRITING_STIMULI),
    grading: normalizeGrading(assignment.grading),
    folderId: assignment.folderId ?? null,
    createdAt: assignment.createdAt,
    updatedAt: now,
  };
  if (min !== undefined) next.minWords = min;
  if (max !== undefined && validRange) next.maxWords = max;
  if (assignment.enforceWordLimit && (min !== undefined || max !== undefined))
    next.enforceWordLimit = true;
  if (assignment.order !== undefined) next.order = assignment.order;
  if (assignment.archivedAt !== undefined)
    next.archivedAt = assignment.archivedAt;
  return next;
}

/** A blank assignment for "New", filed in the folder the teacher has open. */
export function newWritingAssignment(
  id: string,
  title: string,
  folderId: string | null,
  now: number
): WritingAssignmentDefinition {
  return {
    id,
    title,
    prompt: '',
    stimuli: [],
    grading: { mode: 'ungraded' },
    folderId,
    createdAt: now,
    updatedAt: now,
  };
}

/** A copy with fresh ids, back in the library and out of the manual order. */
export function duplicateWritingAssignment(
  assignment: WritingAssignmentDefinition,
  newId: () => string,
  now: number
): WritingAssignmentDefinition {
  const copy: WritingAssignmentDefinition = {
    ...assignment,
    id: newId(),
    title: suggestDuplicateTitle(assignment.title),
    stimuli: (assignment.stimuli ?? []).map((s) => ({ ...s, id: newId() })),
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  delete copy.order;
  return normalizeWritingAssignment(copy, now);
}

/** Short grading summary for a library card. */
export function writingGradingLabel(
  grading: WritingGrading | undefined
): string {
  if (!grading || grading.mode === 'ungraded') return 'Ungraded';
  if (grading.mode === 'points') return writingPointsLabel(grading.points);
  return grading.rubricSnapshot.title || 'Untitled rubric';
}

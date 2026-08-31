/** Per-kind status derivation for the Assignments hub detail pane (M17 spec §5 D2). */

import type { AssignmentStudentStatus } from '@/components/assignmentsHub/AssignmentStatusChip';
import type { QuizResponse } from '@/types';

/**
 * Quiz: 'joined' (no answers yet) reads as Not started; 'in-progress' as
 * In progress; 'completed' splits Submitted/Graded on whether the teacher
 * has entered any manual grade yet. This is a glance-level heuristic (it
 * doesn't check every written question is graded) — good enough for a
 * roster overview, not a substitute for the grader's own completeness check.
 */
export function deriveQuizStudentStatus(
  response: Partial<Pick<QuizResponse, 'status' | 'grading'>> | undefined
): AssignmentStudentStatus {
  if (!response || !response.status || response.status === 'joined')
    return 'not-started';
  if (response.status === 'in-progress') return 'in-progress';
  return Object.keys(response.grading ?? {}).length > 0
    ? 'graded'
    : 'submitted';
}

/** Video-activity / guided-learning: no manual grading step, so status collapses to three states. */
export function deriveCompletedAtStudentStatus(
  completedAt: number | null | undefined,
  hasResponse: boolean
): AssignmentStudentStatus {
  if (!hasResponse) return 'not-started';
  return completedAt == null ? 'in-progress' : 'submitted';
}

/** Mini-app: submission is atomic — either it exists (Submitted) or it doesn't. */
export function deriveSubmissionStudentStatus(
  hasSubmission: boolean
): AssignmentStudentStatus {
  return hasSubmission ? 'submitted' : 'not-started';
}

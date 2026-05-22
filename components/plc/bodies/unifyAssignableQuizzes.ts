/**
 * unifyAssignableQuizzes — Phase 4-prep read-time union.
 *
 * The PLC dashboard is collapsing two parallel shared-content lists into a
 * single quiz library:
 *
 *   - `plcs/{plcId}/quizzes/`     → `PlcQuizEntry[]`        (the Quiz Library)
 *   - `plcs/{plcId}/assignments/` → `PlcAssignmentTemplate[]` (legacy Assignments
 *                                    Library tab)
 *
 * Both back the SAME canonical `synced_quizzes/{syncGroupId}` content. During
 * the transition we must still surface (and keep assignable) any
 * template-only rows authored before quizzes carried run-settings. This pure
 * helper merges the two collections into one list, deduped by `syncGroupId`:
 * a `PlcQuizEntry` always wins over a `PlcAssignmentTemplate` that points at
 * the same canonical group, because the quiz row carries the content-library
 * actions ("Add to my library" / "Edit").
 *
 * Kept pure (no React, no hooks) so it can be unit-tested in isolation and so
 * the body component stays a thin renderer over its output.
 */

import type {
  PlcAssignmentTemplate,
  PlcQuizEntry,
  QuizSessionMode,
  QuizSessionOptions,
} from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';

/**
 * Run-settings + attribution shared by both row variants. The `source`
 * discriminant lets the renderer pick the right action set (and the right
 * sync-join Cloud Function) per row.
 */
interface AssignableQuizRowBase {
  /** Pointer to the canonical `synced_quizzes/{groupId}` doc. Dedup key. */
  syncGroupId: string;
  /** Display title (quiz title / template quizTitle). */
  title: string;
  /** Resolved default session mode for "Assign to my classes". */
  sessionMode: QuizSessionMode;
  /** Resolved default session options for "Assign to my classes". */
  sessionOptions: QuizSessionOptions;
  /** Resolved default attempt limit (`null` = unlimited). */
  attemptLimit: number | null;
  /** Display name snapshot for attribution. */
  sharedByName: string;
  /** Lowercased email snapshot for attribution. */
  sharedByEmail: string;
  /** UID of the original sharer (for "is this mine" checks). */
  sharedBy: string;
  /** ms timestamp; used for ordering. */
  updatedAt: number;
}

export type AssignableQuizRow =
  | (AssignableQuizRowBase & { source: 'quiz'; quiz: PlcQuizEntry })
  | (AssignableQuizRowBase & {
      source: 'template';
      template: PlcAssignmentTemplate;
    });

/**
 * Merge shared quizzes + legacy assignment templates into one assignable
 * list, deduped by `syncGroupId`. A `PlcQuizEntry` wins over a template that
 * shares its `syncGroupId`.
 *
 * Run-settings: quiz rows fall back to `DEFAULT_QUIZ_BEHAVIOR` when their
 * optional fields are absent (legacy entries shared before run-settings
 * moved onto the library); template rows always carry their own settings.
 *
 * Ordering: newest-edit-first by `updatedAt` desc — matches the existing
 * `usePlcQuizzes` / `usePlcAssignments` snapshot ordering.
 */
export function unifyAssignableQuizzes(
  quizzes: PlcQuizEntry[],
  templates: PlcAssignmentTemplate[]
): AssignableQuizRow[] {
  const quizSyncGroupIds = new Set(quizzes.map((q) => q.syncGroupId));

  const quizRows: AssignableQuizRow[] = quizzes.map((quiz) => ({
    source: 'quiz',
    quiz,
    syncGroupId: quiz.syncGroupId,
    title: quiz.title,
    sessionMode: quiz.sessionMode ?? DEFAULT_QUIZ_BEHAVIOR.sessionMode,
    sessionOptions: quiz.sessionOptions ?? DEFAULT_QUIZ_BEHAVIOR.sessionOptions,
    // null = unlimited (explicit); only undefined (legacy/absent) falls back to the default — do NOT use ??
    attemptLimit:
      quiz.attemptLimit === undefined
        ? DEFAULT_QUIZ_BEHAVIOR.attemptLimit
        : quiz.attemptLimit,
    sharedByName: quiz.sharedByName,
    sharedByEmail: quiz.sharedByEmail,
    sharedBy: quiz.sharedBy,
    updatedAt: quiz.updatedAt,
  }));

  const templateRows: AssignableQuizRow[] = templates
    .filter((template) => !quizSyncGroupIds.has(template.syncGroupId))
    .map((template) => ({
      source: 'template',
      template,
      syncGroupId: template.syncGroupId,
      title: template.quizTitle,
      sessionMode: template.sessionMode,
      sessionOptions: template.sessionOptions,
      attemptLimit: template.attemptLimit,
      sharedByName: template.sharedByName,
      sharedByEmail: template.sharedByEmail,
      sharedBy: template.sharedBy,
      updatedAt: template.updatedAt,
    }));

  return [...quizRows, ...templateRows].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
}
